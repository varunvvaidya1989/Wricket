import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const owner = uuid(1), outsider = uuid(2), tournament = uuid(3), stage = uuid(4), group = uuid(5), fixture = uuid(6);
const teams = [7, 8, 9, 10].map(uuid);
let db: PGlite;
const migration = readFileSync(new URL('../../../supabase/migrations/20261011034940_harden_cricket_fixture_transactions.sql', import.meta.url), 'utf8');
const hardening = readFileSync(new URL('../../../supabase/migrations/20260822125242_harden_cricket_match_and_fixture_creation.sql', import.meta.url), 'utf8');
const schema = readFileSync(new URL('../../../supabase/migrations/20260723151201_add_fixture_generation_engine.sql', import.meta.url), 'utf8');
const edit = (input: Record<string, unknown>, manual = true, account = owner) => db.transaction(async tx => {
  await tx.query("select set_config('test.account', $1, true)", [account]);
  await tx.exec('set local role authenticated');
  await tx.query('select public.edit_owned_cricket_fixture($1,$2,$3)', [fixture, JSON.stringify(input), manual]);
});
const input = { team_a_id: teams[2], team_b_id: teams[3], group_id: group, round: 2, round_id: 'MANUAL_R2' };
const plan = () => ({ teamIds: teams, stage: { id: uuid(20), type: 'GROUP', stage_order: 1, config: {} },
  groups: [{ id: uuid(21), name: 'Group A', team_ids: teams }],
  matches: [{ group_id: uuid(21), team_a_id: teams[0], team_b_id: teams[1], round: 1, round_id: 'R1', leg: 1, status: 'SCHEDULED' }],
});
const commit = (payload: ReturnType<typeof plan>) => db.transaction(async tx => {
  await tx.query("select set_config('test.account', $1, true)", [owner]);
  await tx.exec('set local role authenticated');
  return tx.query('select public.commit_owned_cricket_fixture_plan($1,$2)', [tournament, JSON.stringify(payload)]);
});

describe('cricket fixture transactions on actual PostgreSQL', () => {
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`create role anon; create role authenticated; create schema auth; create schema app_private;
      create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.account',true),'')::uuid $$;
      grant usage on schema public,auth,app_private to anon,authenticated;
      create table profiles(id uuid primary key);
      create table tournaments(id uuid primary key, created_by uuid);
      create table teams(id uuid primary key, tournament_id uuid references tournaments(id));`);
    await db.exec(schema.slice(0, schema.indexOf('create table public.custom_formats')));
    await db.exec(`create table matches(id uuid primary key default gen_random_uuid(), fixture_match_id uuid unique references fixture_matches(id) on delete cascade,
      tournament_id uuid,team_a_id uuid,team_b_id uuid,status text default 'SCHEDULED',scheduled_at timestamptz,venue text,updated_at timestamptz);
      create unique index fixture_pair on fixture_matches(stage_id,round_id,team_a_id,team_b_id,leg);
      create function app_private.seed_fixture_match() returns trigger language plpgsql as $$ begin
        if new.team_b_id is not null then insert into matches(fixture_match_id,team_a_id,team_b_id) values(new.id,new.team_a_id,new.team_b_id); end if; return new; end $$;
      create trigger seed_fixture_match after insert on fixture_matches for each row execute function app_private.seed_fixture_match();`);
    await db.exec(hardening.slice(hardening.indexOf('create or replace function app_private.upsert_owned_fixture_matches'), hardening.indexOf('create or replace function public.create_owned_match')));
    await db.exec(migration);
    await db.exec(readFileSync(new URL('../../../supabase/migrations/20261011041023_protect_cricket_fixture_deletion.sql', import.meta.url), 'utf8'));
    await db.exec('create table audit_logs(entity_type text,entity_id uuid); create table fixture_tie_resolutions(group_id uuid,ordered_team_ids uuid[])');
    const deletion = readFileSync(new URL('../../../supabase/migrations/20260804170445_owner_delete_tournament_cascade.sql', import.meta.url), 'utf8');
    await db.exec(deletion.slice(deletion.indexOf('create or replace function app_private.delete_owned_tournament'), deletion.indexOf('create or replace function public.list_owned_tournament_media_paths')));
    await db.exec(`create function public.delete_owned_tournament(p uuid) returns void language sql security invoker as $$ select app_private.delete_owned_tournament(p) $$; grant execute on function public.delete_owned_tournament(uuid) to authenticated;`);
    await db.exec(readFileSync(new URL('../../../supabase/migrations/20261010095815_add_tournament_team_removal.sql', import.meta.url), 'utf8'));
    await db.exec(readFileSync(new URL('../../../supabase/migrations/20261011044417_preserve_authorised_whole_tournament_deletion.sql', import.meta.url), 'utf8'));

  });
  afterAll(async () => { await db?.close(); });
  beforeEach(async () => {
    await db.exec(`truncate tournaments,teams,fixture_stages,fixture_groups,fixture_matches,knockout_brackets,matches cascade;
      insert into tournaments values('${tournament}','${owner}');
      insert into teams values ${teams.map(id => `('${id}','${tournament}')`).join(',')};
      insert into fixture_stages(id,tournament_id,stage_order,type,config) values('${stage}','${tournament}',1,'GROUP','{"manual":true}');
      insert into fixture_groups(id,stage_id,name,team_ids) values('${group}','${stage}','Group A',array[${teams.map(id => `'${id}'`).join(',')}]::uuid[]);
      insert into fixture_matches(id,stage_id,group_id,team_a_id,team_b_id,round,round_id) values('${fixture}','${stage}','${group}','${teams[0]}','${teams[1]}',1,'MANUAL_R1'); update matches set tournament_id='${tournament}';`);
  });
  it('allows owner-confirmed whole deletion while individual completed fixtures stay protected', async () => {
    await db.exec("update matches set status='COMPLETED'; update fixture_matches set status='COMPLETED'");
    await expect(db.exec('delete from fixture_matches')).rejects.toThrow('Only an unstarted');
    await expect(db.exec('delete from teams')).rejects.toThrow('used in fixtures');
    await db.transaction(async tx => {
      await tx.query("select set_config('test.account',$1,true)", [owner]);
      await tx.exec('set local role authenticated');
      await tx.query('select public.delete_owned_tournament($1)', [tournament]);
    });
    for (const table of ['tournaments','teams','matches','fixture_stages','fixture_matches','app_private.cricket_tournament_deletions']) expect((await db.query(`select * from ${table}`)).rows).toHaveLength(0);
  });
  it('denies outsider whole deletion and client attempts to create a guard bypass', async () => {
    await expect(db.transaction(async tx => {
      await tx.query("select set_config('test.account',$1,true)", [outsider]);
      await tx.exec('set local role authenticated');
      await tx.query('select public.delete_owned_tournament($1)', [tournament]);
    })).rejects.toThrow('Only the tournament owner');
    await expect(db.transaction(async tx => {
      await tx.exec('set local role authenticated');
      await tx.query('insert into app_private.cricket_tournament_deletions values(txid_current(),$1)', [tournament]);
    })).rejects.toThrow('permission denied');
    expect((await db.query('select id from matches')).rows).toHaveLength(1);
  });
  it('updates canonical participants and fixture metadata together without changing IDs', async () => {
    const before = (await db.query<{ id: string }>('select id from matches')).rows[0].id;
    await edit(input);
    expect((await db.query('select team_a_id,team_b_id,round from fixture_matches')).rows).toEqual([{ team_a_id: teams[2], team_b_id: teams[3], round: 2 }]);
    expect((await db.query('select id,team_a_id,team_b_id from matches')).rows).toEqual([{ id: before, team_a_id: teams[2], team_b_id: teams[3] }]);
  });
  it('rolls back canonical update when a later fixture write fails', async () => {
    await db.exec(`create function fail_fixture() returns trigger language plpgsql as $$ begin raise exception 'injected fixture failure'; end $$;
      create trigger fail_fixture before update on fixture_matches for each row execute function fail_fixture();`);
    try {
      await expect(edit(input)).rejects.toThrow('injected fixture failure');
      expect((await db.query('select team_a_id from matches')).rows).toEqual([{ team_a_id: teams[0] }]);
      expect((await db.query('select round from fixture_matches')).rows).toEqual([{ round: 1 }]);
    } finally { await db.exec('drop trigger fail_fixture on fixture_matches; drop function fail_fixture()'); }
  });
  it.each(['SETUP','TOSS','IN_PROGRESS','COMPLETED','ABANDONED'])('refuses a canonical %s match even if fixture metadata is stale', async status => {
    await db.query('update matches set status=$1', [status]);
    await expect(edit(input)).rejects.toThrow('Only an unstarted fixture');
  });
  it('denies a non-owner and invalid tournament participants', async () => {
    await expect(edit(input, true, outsider)).rejects.toThrow('Only the tournament owner');
    await expect(edit({ ...input, team_a_id: outsider })).rejects.toThrow('Both teams must belong');
  });
  it('schedules only the current pairing and retains its canonical ID', async () => {
    await edit({ team_a_id: teams[0], team_b_id: teams[1], scheduled_at: '2026-10-12T09:00:00Z', venue: ' Oval ' }, false);
    expect((await db.query('select venue from matches')).rows).toEqual([{ venue: 'Oval' }]);
    await expect(edit(input, false)).rejects.toThrow('manual fixture editor');
  });
  it('rebuilds a manual bracket atomically when a fixture changes round, and removes its empty projection', async () => {
    await db.exec("update fixture_stages set type='KNOCKOUT'");
    await edit({ ...input, group_id: null, round_id: 'F' });
    const bracket = (await db.query<{ rounds: { id: string; matches: { teamA: string }[] }[] }>('select rounds from knockout_brackets')).rows[0];
    expect(bracket.rounds.map(round => round.id)).toEqual(['F']);
    expect(bracket.rounds[0].matches[0].teamA).toBe(teams[2]);
    await db.exec('delete from fixture_matches');
    expect((await db.query('select id from knockout_brackets')).rows).toHaveLength(0);
  });
  it('denies anonymous RPC execution', async () => {
    await expect(db.transaction(async tx => {
      await tx.exec('set local role anon');
      await tx.query('select public.edit_owned_cricket_fixture($1,$2,true)', [fixture,JSON.stringify(input)]);
    })).rejects.toThrow('permission denied');
  });
  it('rejects competing manual fixtures for one team in a round', async () => {
    await expect(db.query('insert into fixture_matches(stage_id,group_id,team_a_id,team_b_id,round,round_id) values($1,$2,$3,$4,1,$5)',
      [stage,group,teams[0],teams[2],'MANUAL_R1'])).rejects.toThrow('already has a fixture');
    expect((await db.query('select id from matches')).rows).toHaveLength(1);
  });
  it('commits a complete plan and treats acknowledgement-loss retry as the same request', async () => {
    await db.exec('delete from fixture_stages');
    const payload = plan(); await commit(payload); await commit(payload);
    expect((await db.query('select id from fixture_stages')).rows).toHaveLength(1);
    expect((await db.query('select id from matches')).rows).toHaveLength(1);
    await expect(commit({ ...payload, matches: [] })).rejects.toThrow('different details');
  });
  it('rolls back stage and groups after invalid pairings', async () => {
    await db.exec('delete from fixture_stages');
    const payload = plan(); payload.matches[0].team_b_id = outsider;
    await expect(commit(payload)).rejects.toThrow('eligible unstarted pairings');
    expect((await db.query('select id from fixture_stages')).rows).toHaveLength(0);
    expect((await db.query('select id from fixture_groups')).rows).toHaveLength(0);
  });
  it('reset is owner-only and locks out started canonical matches', async () => {
    await db.query('update matches set status=$1', ['IN_PROGRESS']);
    await expect(db.transaction(async tx => {
      await tx.query("select set_config('test.account',$1,true)", [owner]);
      await tx.query('select public.reset_owned_cricket_fixtures($1,false)', [tournament]);
    })).rejects.toThrow('after a match has started');
    expect((await db.query('select id from matches')).rows).toHaveLength(1);
  });
  it('direct fixture or stage deletion cannot remove started canonical history', async () => {
    await db.query('update matches set status=$1', ['IN_PROGRESS']);
    await expect(db.exec('delete from fixture_matches')).rejects.toThrow('Only an unstarted fixture');
    await expect(db.exec('delete from fixture_stages')).rejects.toThrow('Started match history');
    expect((await db.query('select id from matches')).rows).toHaveLength(1);
  });
  it('fixture removal RPC checks ownership and deletes canonical match and bracket together', async () => {
    const remove = (account: string) => db.transaction(async tx => {
      await tx.query("select set_config('test.account',$1,true)", [account]);
      await tx.exec('set local role authenticated');
      await tx.query('select public.delete_owned_cricket_fixture($1)', [fixture]);
    });
    await expect(remove(outsider)).rejects.toThrow('Only the tournament owner');
    await remove(owner);
    expect((await db.query('select id from matches')).rows).toHaveLength(0);
    expect((await db.query('select id from fixture_matches')).rows).toHaveLength(0);
    await remove(owner); // Lost acknowledgement retry is safe.
  });

});
