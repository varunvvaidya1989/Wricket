import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const migration = readFileSync(resolve(__dirname, '../../../supabase/migrations/20261010110748_add_tournament_registration_foundations.sql'), 'utf8');
const owner = '00000000-0000-4000-8000-000000000001';
const applicant = '00000000-0000-4000-8000-000000000002';
const viewer = '00000000-0000-4000-8000-000000000003';
const tournament = '00000000-0000-4000-8000-000000000004';
let db: PGlite;
async function asAccount<T>(account: string, sql: string, params: unknown[] = [], role = 'authenticated') {
  await db.exec('set role ' + role);
  try {
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [account]);
    return await db.query<T>(sql, params);
  } finally { await db.exec('reset role'); }
}
const configure = (account = owner, mode = 'PLAYER_POOL', published = true, open = true, fee = true) => asAccount(account,
  "select public.configure_tournament_registration($1,$2,$3,$4,$5,'₹500 per player','Contact the organiser')", [tournament, mode, published, open, fee]);
async function submit(account = applicant, phone = '+91 90000 00000', role = 'AR', note = 'Private note') {
  const result = await asAccount<{ id: string }>(account, 'select public.submit_tournament_player_registration($1,$2,$3,$4) as id', [tournament, role, phone, note]);
  return result.rows[0].id;
}
const review = (id: string, account = owner, status: string | null = 'APPROVED', payment: string | null = null) => asAccount(account, 'select public.review_tournament_player_registration($1,$2,$3)', [id, status, payment]);
const directory = (account = viewer) => asAccount<{ display_name: string }>(account, 'select * from public.list_registered_tournament_players($1)', [tournament]);

describe('tournament registration migration', () => {
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`create role authenticated; create role anon; create schema app_private; create schema auth;
      grant usage on schema app_private,auth to authenticated,anon;
      create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create table profiles(id uuid primary key,display_name text not null);
      create table players(id uuid primary key default gen_random_uuid(),profile_id uuid references profiles(id),display_name text,created_by uuid);
      create unique index players_one_profile_identity_idx on players(profile_id) where profile_id is not null;
      create table tournaments(id uuid primary key,created_by uuid,visibility text default 'PRIVATE',settings jsonb default '{}');
      create table teams(id uuid primary key default gen_random_uuid(),tournament_id uuid references tournaments(id) on delete cascade);
      create table team_players(team_id uuid,player_id uuid);
      alter table tournaments enable row level security;
      create policy read_tournament on tournaments for select to authenticated using (created_by = auth.uid() or visibility = 'PUBLIC');
      grant select on profiles,players,tournaments to authenticated;
      insert into tournaments values ('${tournament}','${owner}','PRIVATE','{}');`);
    await db.exec(migration);
  });
  afterAll(async () => { await db?.close(); });
  beforeEach(async () => {
    await db.exec(`truncate tournaments,teams,profiles,players cascade;
      insert into profiles values ('${owner}','Organiser'),('${applicant}','Pool Player'),('${viewer}','Other Player');
      insert into tournaments values ('${tournament}','${owner}','PRIVATE','{}');`);
  });
  it('backfills old tournaments and initializes new tournaments with legacy-safe entry mode', async () => {
    expect((await db.query('select entry_mode,registration_open,published_at from tournament_registration_settings')).rows).toEqual([{ entry_mode: 'EXISTING_TEAMS', registration_open: false, published_at: null }]);
    await db.exec(`insert into tournaments values ('${viewer}','${owner}','PRIVATE','{"entryMode":"PLAYER_POOL"}')`);
    expect((await db.query('select entry_mode from tournament_registration_settings where tournament_id=$1', [viewer])).rows[0]).toEqual({ entry_mode: 'PLAYER_POOL' });
  });
  it('separates publication from opening and does not change match lifecycle settings', async () => {
    await configure(owner, 'PLAYER_POOL', true, false);
    expect((await db.query('select visibility,settings from tournaments')).rows[0]).toEqual({ visibility: 'PUBLIC', settings: {} });
    await expect(submit()).rejects.toThrow('Registration is closed');
    await configure(); expect(await submit()).toBeTruthy();
  });
  it('denies config mutation by another account and direct table mutation', async () => {
    await expect(configure(viewer)).rejects.toThrow('Only the tournament organiser');
    await expect(asAccount(owner, 'update tournament_registration_settings set registration_open=true')).rejects.toThrow('permission denied');
    await expect(asAccount(applicant, 'insert into tournament_player_registrations(id) values (gen_random_uuid())')).rejects.toThrow('permission denied');
  });
  it('does not open an unpublished tournament or an existing-team application flow', async () => {
    await expect(configure(owner, 'PLAYER_POOL', false, true)).rejects.toThrow('Publish the tournament');
    await expect(configure(owner, 'EXISTING_TEAMS')).rejects.toThrow('managed through team entries');
  });
  it('rejects private, closed and wrong-mode submissions', async () => {
    await expect(submit()).rejects.toThrow('Registration is closed');
    await configure(owner, 'EXISTING_TEAMS', true, false);
    await db.exec('update tournament_registration_settings set registration_open=true');
    await expect(submit()).rejects.toThrow('through their team');
    await configure(); await db.exec("update tournaments set visibility='PRIVATE'");
    await expect(submit()).rejects.toThrow('Registration is closed');
  });
  it.each([['123', 'AR'], ['+91 90000 00000', 'CAPTAIN'], ['1'.repeat(41), 'BAT']])('validates form phone %s and role %s', async (phone, role) => {
    await configure(); await expect(submit(applicant, phone, role)).rejects.toThrow();
    expect((await db.query('select * from players')).rows).toHaveLength(0);
  });
  it('validates note length and requires an account profile', async () => {
    await configure(); await expect(submit(applicant, '+919000000000', 'AR', 'x'.repeat(1001))).rejects.toThrow('1000');
    await expect(submit(tournament)).rejects.toThrow('Complete your profile');
  });
  it('submits once per account and reuses canonical player without creating roster membership', async () => {
    await configure(); await db.exec(`insert into players(profile_id,display_name) values ('${applicant}','Canonical player')`);
    const id = await submit(); expect(id).toBeTruthy();
    await expect(submit()).rejects.toThrow('already have an application');
    expect((await db.query('select * from players')).rows).toHaveLength(1);
    expect((await db.query('select * from team_players')).rows).toHaveLength(0);
  });
  it('keeps pending form, notes and payment private while organiser can review', async () => {
    await configure(); await submit();
    const sql = 'select contact_phone,applicant_note,payment_status from tournament_player_registrations';
    expect((await asAccount(viewer, sql)).rows).toHaveLength(0);
    expect((await asAccount(applicant, sql)).rows).toHaveLength(1);
    expect((await asAccount(owner, sql)).rows).toHaveLength(1);
    expect((await directory()).rows).toHaveLength(0);
    expect((await asAccount(viewer, 'select * from tournament_registration_events')).rows).toHaveLength(0);
  });
  it('approves with payment pending and exposes only safe directory fields', async () => {
    await configure(); const id = await submit(); await review(id);
    const rows = (await directory()).rows; expect(rows[0].display_name).toBe('Pool Player');
    expect(Object.keys(rows[0]).sort()).toEqual(['registration_id','player_id','account_id','display_name','playing_role','registered_at'].sort());
    expect((await asAccount(applicant, 'select status,payment_status from tournament_player_registrations')).rows[0]).toEqual({ status: 'APPROVED', payment_status: 'PENDING' });
  });
  it('organiser changes payment independently with audit actor, time and history', async () => {
    await configure(); const id = await submit(); await review(id, owner, null, 'DONE');
    expect((await asAccount(applicant, 'select status,payment_status,payment_marked_by,payment_marked_at from tournament_player_registrations')).rows[0]).toMatchObject({ status: 'PENDING', payment_status: 'DONE', payment_marked_by: owner });
    expect((await asAccount(owner, "select actor_id,previous_value,next_value from tournament_registration_events where kind='PAYMENT_MARKED'")).rows[0]).toEqual({ actor_id: owner, previous_value: 'PENDING', next_value: 'DONE' });
    await expect(review(id, applicant, null, 'PENDING')).rejects.toThrow('Only the tournament organiser');
    await expect(review(id, viewer)).rejects.toThrow('Only the tournament organiser');
  });
  it('rolls back review if a simultaneous payment flag is invalid', async () => {
    await configure(); const id = await submit(); await expect(review(id, owner, 'APPROVED', 'NOT_REQUIRED')).rejects.toThrow('Invalid payment');
    expect((await asAccount(applicant, 'select status from tournament_player_registrations')).rows[0]).toEqual({ status: 'PENDING' });
  });
  it('keeps free applications Not required and rejects invented payment flags', async () => {
    await configure(owner, 'PLAYER_POOL', true, true, false); const id = await submit();
    expect((await asAccount(applicant, 'select payment_status from tournament_player_registrations')).rows[0]).toEqual({ payment_status: 'NOT_REQUIRED' });
    await expect(review(id, owner, null, 'DONE')).rejects.toThrow('Invalid payment');
  });
  it('removes rejected/withdrawn applicants from directory and restricts withdrawal to applicant', async () => {
    await configure(); const id = await submit(); await review(id);
    await expect(asAccount(viewer, 'select public.withdraw_tournament_player_registration($1)', [id])).rejects.toThrow('Only the applicant');
    await asAccount(applicant, 'select public.withdraw_tournament_player_registration($1)', [id]);
    expect((await directory()).rows).toHaveLength(0);
    await expect(review(id)).rejects.toThrow('cannot be reviewed');
    await expect(submit()).rejects.toThrow('already have an application');
  });
  it('rejects an application without removing the underlying account identity', async () => {
    await configure(); const id = await submit(); await review(id, owner, 'REJECTED');
    expect((await directory()).rows).toHaveLength(0); expect((await db.query('select * from players')).rows).toHaveLength(1);
  });
  it('locks entry mode and fee requirement after an application, permits closing and retains directory', async () => {
    await configure(); const id = await submit(); await review(id);
    await expect(configure(owner, 'EXISTING_TEAMS', true, false)).rejects.toThrow('Entry mode locks');
    await expect(configure(owner, 'PLAYER_POOL', true, true, false)).rejects.toThrow('Fee requirement locks');
    await expect(configure(owner, 'PLAYER_POOL', false, false)).rejects.toThrow('Close registration instead');
    await configure(owner, 'PLAYER_POOL', true, false); await expect(submit(viewer)).rejects.toThrow('Registration is closed');
    expect((await directory()).rows).toHaveLength(1);
  });
  it('locks mode when a placeholder exists and rejects directory access before publication', async () => {
    await db.exec('insert into teams(tournament_id) values ($$' + tournament + '$$)');
    await expect(configure()).rejects.toThrow('Entry mode locks');
    await expect(directory()).rejects.toThrow('unavailable');
    expect((await asAccount(viewer, 'select * from tournament_registration_settings')).rows).toHaveLength(0);
  });
  it('denies anonymous execution and requires a nonempty authenticated identity', async () => {
    await expect(asAccount(applicant, 'select public.list_registered_tournament_players($1)', [tournament], 'anon')).rejects.toThrow('permission denied');
    await configure(); await expect(submit('')).rejects.toThrow('Sign in');
  });
});
