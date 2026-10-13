import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const migration = readFileSync(resolve(__dirname, '../../../supabase/migrations/20261010095815_add_tournament_team_removal.sql'), 'utf8');
const owner = '00000000-0000-4000-8000-000000000001';
const captain = '00000000-0000-4000-8000-000000000002';
const tournament = '00000000-0000-4000-8000-000000000003';
const team = '00000000-0000-4000-8000-000000000004';
const source = '00000000-0000-4000-8000-000000000005';
const stage = '00000000-0000-4000-8000-000000000006';
const group = '00000000-0000-4000-8000-000000000007';
let db: PGlite;
const call = async (account = owner, role = 'authenticated', tournamentId = tournament, teamId = team) => {
  await db.exec('set role ' + role);
  try {
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [account]);
    return await db.query<{ removed: string }>('select public.remove_owned_tournament_team($1,$2) as removed', [tournamentId, teamId]);
  } finally { await db.exec('reset role'); }
};

describe('tournament team removal migration', () => {
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`create role authenticated; create role anon; create schema app_private; create schema auth;
      grant usage on schema app_private,auth to authenticated,anon;
      create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      create table tournaments(id uuid primary key, created_by uuid);
      create table teams(id uuid primary key, tournament_id uuid references tournaments(id), source_team_id uuid references teams(id));
      create table team_players(team_id uuid references teams(id) on delete cascade, player_id uuid);
      create table fixture_stages(id uuid primary key, tournament_id uuid, config jsonb default '{}');
      create table fixture_groups(id uuid primary key, stage_id uuid, team_ids uuid[]);
      create table fixture_tie_resolutions(group_id uuid, ordered_team_ids uuid[]);
      create table fixture_matches(team_a_id uuid references teams(id) on delete restrict, team_b_id uuid);
      create table matches(team_a_id uuid references teams(id) on delete restrict, team_b_id uuid, status text);
      create table knockout_brackets(stage_id uuid, rounds jsonb);`);
    await db.exec(migration);
  });
  afterAll(async () => { await db?.close(); });
  beforeEach(async () => {
    await db.exec(`truncate tournaments, teams, team_players, fixture_stages, fixture_groups, fixture_tie_resolutions, fixture_matches, matches, knockout_brackets cascade;
      insert into tournaments values ('${tournament}', '${owner}');
      insert into teams values ('${source}', null, null), ('${team}', '${tournament}', '${source}');
      insert into team_players values ('${source}', '${owner}'), ('${team}', '${owner}');
      insert into fixture_stages values ('${stage}', '${tournament}', '{}');
      insert into fixture_groups values ('${group}', '${stage}', array['${team}']::uuid[]);
      insert into fixture_tie_resolutions values ('${group}', array['${team}']::uuid[]);`);
  });
  it('removes only the entry and its roster, cleans group assignments and invalidates affected tie resolutions', async () => {
    expect((await call()).rows[0].removed).toBe(team);
    expect((await db.query('select id from teams')).rows).toEqual([{ id: source }]);
    expect((await db.query('select team_id from team_players')).rows).toEqual([{ team_id: source }]);
    expect((await db.query('select team_ids from fixture_groups')).rows).toEqual([{ team_ids: [] }]);
    expect((await db.query('select * from fixture_tie_resolutions')).rows).toHaveLength(0);
  });
  it.each([captain, source])('denies another account %s, including a captain', async account => {
    await expect(call(account)).rejects.toThrow('Only the tournament organiser');
    expect((await db.query('select id from teams')).rows).toHaveLength(2);
  });
  it('denies anonymous execution', async () => { await expect(call(owner, 'anon')).rejects.toThrow('permission denied'); });
  it('rejects wrong tournament and standalone source IDs', async () => {
    await expect(call(owner, 'authenticated', source)).rejects.toThrow('Only the tournament organiser');
    await expect(call(owner, 'authenticated', tournament, source)).rejects.toThrow('no longer entered');
  });
  it('reports an already removed entry as missing', async () => {
    await call(); await expect(call()).rejects.toThrow('no longer entered');
  });
  it('blocks fixture references on either side, without changing groups or roster', async () => {
    await db.exec(`insert into fixture_matches values ('${source}', '${team}')`);
    await expect(call()).rejects.toThrow('used in fixtures');
    expect((await db.query('select team_ids from fixture_groups')).rows[0]).toEqual({ team_ids: [team] });
    expect((await db.query('select * from team_players')).rows).toHaveLength(2);
  });
  it.each(['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'ABANDONED'])('retains %s match history', async status => {
    await db.query('insert into matches values ($1,$2,$3)', [team, source, status]);
    await expect(call()).rejects.toThrow('Recorded matches must be retained');
  });
  it('blocks a seeded bracket even if its fixture rows have not yet been saved', async () => {
    await db.query('insert into knockout_brackets values ($1,$2)', [stage, JSON.stringify([{ matches: [{ teamA: team }] }])]);
    await expect(call()).rejects.toThrow('used in fixtures');
  });
  it('blocks progression configuration referencing the team', async () => {
    await db.query('update fixture_stages set config = $1', [JSON.stringify({ directFinalistTeamId: team })]);
    await expect(call()).rejects.toThrow('used in fixtures');
  });
  it('enforces the history guard for direct table deletes too', async () => {
    await db.exec(`insert into matches values ('${team}', '${source}', 'COMPLETED')`);
    await expect(db.query('delete from teams where id = $1', [team])).rejects.toThrow('used in fixtures');
  });
});
