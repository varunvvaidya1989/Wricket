import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const prior = readFileSync(resolve(__dirname, '../../../supabase/migrations/20260806142918_enforce_playing_xi_and_keeper_selection.sql'), 'utf8').split('create or replace function app_private.validate_completed_playing_xi()')[0];
const fix = readFileSync(resolve(__dirname, '../../../supabase/migrations/20261010085828_fix_team_keeper_rpc_permissions.sql'), 'utf8');
const owner = '00000000-0000-4000-8000-000000000001';
const captain = '00000000-0000-4000-8000-000000000002';
const viewer = '00000000-0000-4000-8000-000000000003';
const team = '00000000-0000-4000-8000-000000000004';
const player = '00000000-0000-4000-8000-000000000005';
let db: PGlite;
const call = async (account: string, keeper: boolean, role = 'authenticated') => {
  await db.exec('set role ' + role);
  try {
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [account]);
    await db.query('select public.set_team_player_keeper($1,$2,$3)', [team, player, keeper]);
  } finally { await db.exec('reset role'); }
};

describe('keeper RPC execution permissions', () => {
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`create role authenticated; create role anon;
      create schema app_private; create schema auth;
      grant usage on schema app_private, auth to authenticated;
      create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      create function app_private.is_team_captain(uuid) returns boolean language sql as $$ select auth.uid() = '${captain}'::uuid $$;
      create function app_private.is_tournament_owner_for_team(uuid) returns boolean language sql as $$ select auth.uid() = '${owner}'::uuid $$;
      create table public.team_players(team_id uuid, player_id uuid, is_keeper boolean);
      insert into public.team_players values ('${team}', '${player}', false);`);
    await db.exec(prior);
  });
  afterAll(async () => { await db?.close(); });
  it('reproduces the missing private grant, then allows an authorised owner', async () => {
    await expect(call(owner, true)).rejects.toThrow(/permission denied for function set_team_player_keeper/);
    await db.exec(fix);
    await call(owner, true);
    expect((await db.query<{ is_keeper: boolean }>('select is_keeper from public.team_players')).rows[0].is_keeper).toBe(true);
  });
  it('allows the captain to change the keeper flag', async () => {
    await call(captain, false);
    expect((await db.query<{ is_keeper: boolean }>('select is_keeper from public.team_players')).rows[0].is_keeper).toBe(false);
  });
  it('retains the server role check for an authenticated viewer', async () => {
    await expect(call(viewer, true)).rejects.toThrow('Only the tournament owner or team captain can manage wicketkeepers');
    expect((await db.query<{ is_keeper: boolean }>('select is_keeper from public.team_players')).rows[0].is_keeper).toBe(false);
  });
  it('does not grant anonymous access to either entry point', async () => {
    await expect(call('', true, 'anon')).rejects.toThrow(/permission denied/);
    const { rows } = await db.query<{ allowed: boolean }>("select has_function_privilege('anon','public.set_team_player_keeper(uuid,uuid,boolean)','execute') or has_function_privilege('anon','app_private.set_team_player_keeper(uuid,uuid,boolean)','execute') as allowed");
    expect(rows[0].allowed).toBe(false);
  });
});
