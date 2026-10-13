import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const sql = (name: string) => readFileSync(resolve(__dirname, '../../../supabase/migrations/' + name), 'utf8');
const owner = '00000000-0000-4000-8000-000000000001';
const captain = '00000000-0000-4000-8000-000000000002';
const other = '00000000-0000-4000-8000-000000000003';
const tournament = '00000000-0000-4000-8000-000000000004';
const club = '00000000-0000-4000-8000-000000000005';
const placeholder = '00000000-0000-4000-8000-000000000006';
let db: PGlite;
async function call<T = Record<string, unknown>>(account: string, query: string, params: unknown[] = [], role = 'authenticated') {
  await db.exec('set role ' + role);
  try {
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [account]);
    return (await db.query<T>(query, params)).rows;
  } finally { await db.exec('reset role'); }
}
const configure = (mode = 'EXISTING_TEAMS', open = true, published = true, fee = true) => call(owner,
  "select public.configure_tournament_registration($1,$2,$3,$4,$5,'₹500','External payment')", [tournament, mode, published, open, fee]);
async function invitation(teamId: string | null = null, target: string | null = null, account = owner) {
  return (await call<{ invite: { invitation_id: string; token: string } }>(account, 'select public.create_tournament_entry_invitation($1,$2,$3,168) as invite', [tournament, teamId, target]))[0].invite;
}
async function submit(account = captain, source = club, token: string | null = null, phone = '+919000000000') {
  return (await call<{ id: string }>(account, 'select public.submit_tournament_team_application($1,$2,$3,$4,$5) as id', [tournament, source, phone, 'Private team note', token]))[0].id;
}
async function review(id: string, account = owner, status: string | null = 'APPROVED', payment: string | null = null) {
  return (await call<{ entry: string | null }>(account, 'select public.review_tournament_team_application($1,$2,$3) as entry', [id, status, payment]))[0].entry;
}
const claim = (token: string, account = captain) => call<{ entry: string }>(account, 'select public.claim_tournament_placeholder($1) as entry', [token]);
const preview = (token: string, account = captain) => call(account, 'select public.preview_tournament_entry_invitation($1)', [token]);
async function makePlaceholder() { await db.query('insert into teams(id,tournament_id,name,entity_owner_id) values($1,$2,$3,$4)', [placeholder, tournament, 'Reserved XI', owner]); }

describe('tournament team applications and captain claims migration', () => {
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`create role authenticated; create role anon; create schema app_private; create schema auth;
      grant usage on schema auth,app_private to authenticated,anon;
      create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create table profiles(id uuid primary key,display_name text not null);
      create table players(id uuid primary key default gen_random_uuid(),profile_id uuid references profiles(id),display_name text,created_by uuid,role text default 'AR');
      create unique index players_one_profile_identity_idx on players(profile_id) where profile_id is not null;
      create table tournaments(id uuid primary key,created_by uuid,name text default 'Tournament',visibility text default 'PRIVATE',settings jsonb default '{}',planned_team_count integer default 2,players_per_team integer default 3);
      create table teams(id uuid primary key default gen_random_uuid(),tournament_id uuid references tournaments(id) on delete cascade,name text,short_name text default 'XI',color_hex text default '#19AF74',logo_url text,entity_owner_id uuid,source_team_id uuid references teams(id));
      create unique index teams_one_source_per_tournament_idx on teams(tournament_id,source_team_id) where tournament_id is not null and source_team_id is not null;
      create table team_players(team_id uuid references teams(id) on delete cascade,player_id uuid references players(id),jersey_no integer,is_captain boolean default false,is_keeper boolean default false,created_at timestamptz default now(),primary key(team_id,player_id));
      create table team_account_members(team_id uuid references teams(id) on delete cascade,account_id uuid references profiles(id),player_id uuid,role text,status text default 'ACTIVE',joined_at timestamptz default now(),updated_at timestamptz default now(),primary key(team_id,account_id));
      create unique index one_captain on team_account_members(team_id) where role = 'CAPTAIN' and status = 'ACTIVE';
      alter table tournaments enable row level security;
      create policy tournaments_read on tournaments for select to authenticated using (visibility = 'PUBLIC' or created_by = auth.uid());
      grant select on tournaments,profiles,players,teams,team_players,team_account_members to authenticated;`);
    await db.exec(sql('20261010110748_add_tournament_registration_foundations.sql'));
    await db.exec(sql('20261010120051_add_tournament_team_applications_and_claims.sql'));
    await db.exec(sql('20261010124734_add_tournament_participation_and_forms.sql'));
  });
  afterAll(async () => { await db?.close(); });
  beforeEach(async () => {
    await db.exec(`truncate tournaments,teams,profiles,players cascade;
      insert into profiles values ('${owner}','Organiser'),('${captain}','Captain'),('${other}','Other player');
      insert into players(id,profile_id,display_name) values ('${captain}','${captain}','Captain'),('${other}','${other}','Other player');
      insert into tournaments(id,created_by) values ('${tournament}','${owner}');
      insert into teams(id,name,entity_owner_id) values ('${club}','Club XI','${captain}');
      insert into team_players(team_id,player_id,is_captain) values ('${club}','${captain}',true);
      insert into team_account_members(team_id,account_id,player_id,role) values ('${club}','${captain}','${captain}','CAPTAIN');`);
  });
  it('opens existing-team applications without creating any entry', async () => {
    await configure(); const id = await submit(); expect(id).toBeTruthy();
    expect((await db.query('select id from teams where tournament_id=$1', [tournament])).rows).toHaveLength(0);
  });
  it('keeps private application and event rows restricted to organiser/applicant', async () => {
    await configure(); await submit();
    expect(await call(other, 'select * from tournament_team_applications')).toHaveLength(0);
    expect(await call(other, 'select * from tournament_team_application_events')).toHaveLength(0);
    expect(await call(captain, 'select contact_phone,applicant_note from tournament_team_applications')).toHaveLength(1);
    expect(await call(owner, 'select * from tournament_team_applications')).toHaveLength(1);
    await expect(call(captain, "update tournament_team_applications set status='APPROVED'")).rejects.toThrow('permission denied');
  });
  it('rejects ordinary members and ownerless clubs, even when ownership is null', async () => {
    await configure(); await db.exec(`update teams set entity_owner_id=null; insert into team_account_members(team_id,account_id,player_id,role) values('${club}','${other}','${other}','PLAYER')`);
    await expect(submit(other)).rejects.toThrow('Only the team owner or active captain');
    expect(await submit()).toBeTruthy();
  });
  it('rejects private, closed, player-pool and invalid form submissions', async () => {
    await expect(submit()).rejects.toThrow('closed');
    await configure('PLAYER_POOL'); await expect(submit()).rejects.toThrow('closed');
    await configure(); await expect(submit(captain, club, null, '123')).rejects.toThrow('contact number');
    await db.exec("update tournaments set visibility='PRIVATE'"); await expect(submit()).rejects.toThrow('closed');
  });
  it('rejects duplicate applications and applying with a tournament entry instead of a reusable club', async () => {
    await configure(); await submit(); await expect(submit()).rejects.toThrow('already has');
    await makePlaceholder(); await expect(submit(owner, placeholder)).rejects.toThrow('reusable club');
  });
  it('copies current roster and access to a new entry once, with payment still pending', async () => {
    await configure(); const id = await submit();
    await db.exec(`insert into team_players(team_id,player_id,is_keeper) values('${club}','${other}',true); insert into team_account_members(team_id,account_id,player_id,role) values('${club}','${other}','${other}','PLAYER')`);
    const entry = await review(id); expect(entry).toBeTruthy(); expect(await review(id)).toBe(entry);
    expect((await db.query('select source_team_id,entity_owner_id from teams where id=$1', [entry])).rows[0]).toEqual({ source_team_id: club, entity_owner_id: captain });
    expect((await db.query('select player_id,is_captain,is_keeper from team_players where team_id=$1 order by player_id', [entry])).rows).toEqual([{ player_id: captain, is_captain: true, is_keeper: false }, { player_id: other, is_captain: false, is_keeper: true }]);
    expect((await call(captain, 'select status,payment_status from tournament_team_applications'))[0]).toEqual({ status: 'APPROVED', payment_status: 'PENDING' });
    expect((await db.query('select * from team_account_members where team_id=$1', [entry])).rows).toHaveLength(2);
    expect((await db.query('select * from team_players where team_id=$1', [club])).rows).toHaveLength(2);
  });
  it('only organiser reviews and updates payment, with auditable independent flags', async () => {
    await configure(); const id = await submit(); await expect(review(id, captain)).rejects.toThrow('Only the tournament organiser');
    await expect(review(id, other, null, 'DONE')).rejects.toThrow('Only the tournament organiser');
    await review(id, owner, null, 'DONE');
    expect((await call(captain, 'select status,payment_status,payment_marked_by from tournament_team_applications'))[0]).toEqual({ status: 'PENDING', payment_status: 'DONE', payment_marked_by: owner });
    expect(await call(owner, "select * from tournament_team_application_events where kind='PAYMENT_MARKED'")).toHaveLength(1);
  });
  it('rolls back entry creation if a payment flag is invalid in the same review', async () => {
    await configure(); const id = await submit(); await expect(review(id, owner, 'APPROVED', 'NOT_REQUIRED')).rejects.toThrow('Invalid payment');
    expect((await db.query('select id from teams where tournament_id=$1', [tournament])).rows).toHaveLength(0);
    expect((await call(captain, 'select status from tournament_team_applications'))[0]).toEqual({ status: 'PENDING' });
  });
  it('free team applications keep payment Not required', async () => {
    await configure('EXISTING_TEAMS', true, true, false); const id = await submit();
    await expect(review(id, owner, null, 'DONE')).rejects.toThrow('Invalid payment');
    expect((await call(captain, 'select payment_status from tournament_team_applications'))[0]).toEqual({ payment_status: 'NOT_REQUIRED' });
  });
  it('rechecks capacity including reserved placeholders during approval and legacy team inserts', async () => {
    await configure(); const id = await submit(); await makePlaceholder();
    await db.exec(`insert into teams(tournament_id,name) values('${tournament}','Other entry')`);
    await expect(review(id)).rejects.toThrow('no available team places');
    await expect(db.query('insert into teams(tournament_id,name) values($1,$2)', [tournament, 'Over capacity'])).rejects.toThrow('no available team places');
  });
  it('rejects approval while closed and preserves pending state', async () => {
    await configure(); const id = await submit(); await configure('EXISTING_TEAMS', false);
    await expect(review(id)).rejects.toThrow('Open team applications');
    expect((await call(captain, 'select status from tournament_team_applications'))[0]).toEqual({ status: 'PENDING' });
  });
  it('rechecks the applicant authority and current captain before approval', async () => {
    await configure(); const id = await submit(); await db.exec(`update teams set entity_owner_id=null; update team_account_members set status='REMOVED'`);
    await expect(review(id)).rejects.toThrow('no longer manages');
    await db.exec(`update teams set entity_owner_id='${captain}'`); await expect(review(id)).rejects.toThrow('active captain');
  });
  it('rejects an oversized roster and overlap with another entered team', async () => {
    await configure(); const id = await submit(); await db.exec('update tournaments set players_per_team=1');
    await db.exec(`insert into team_players(team_id,player_id) values('${club}','${other}')`);
    await expect(review(id)).rejects.toThrow('roster size');
    await db.exec('update tournaments set players_per_team=3'); await makePlaceholder();
    await db.exec(`insert into team_players(team_id,player_id) values('${placeholder}','${captain}')`);
    await expect(review(id)).rejects.toThrow('already plays');
  });
  it('locks entry mode, fee requirements and unpublishing after team application', async () => {
    await configure(); await submit();
    await expect(configure('PLAYER_POOL')).rejects.toThrow('Entry mode locks');
    await expect(configure('EXISTING_TEAMS', true, true, false)).rejects.toThrow('Fee requirement locks');
    await expect(configure('EXISTING_TEAMS', false, false)).rejects.toThrow('Close registration');
  });
  it('lets only applicant withdraw pending applications and prevents review after withdrawal', async () => {
    await configure(); const id = await submit();
    await expect(call(other, 'select public.withdraw_tournament_team_application($1)', [id])).rejects.toThrow('Only the applicant');
    await call(captain, 'select public.withdraw_tournament_team_application($1)', [id]);
    await expect(review(id)).rejects.toThrow('cannot be reviewed');
  });
  it('does not withdraw or reject an approved entry, which may have fixtures', async () => {
    await configure(); const id = await submit(); await review(id);
    await expect(call(captain, 'select public.withdraw_tournament_team_application($1)', [id])).rejects.toThrow('Only pending');
    await expect(review(id, owner, 'REJECTED')).rejects.toThrow('tournament management');
  });
  it('general invitation records usage only after successful application and rejects another tournament token', async () => {
    await configure(); const invite = await invitation();
    await expect(submit(captain, club, invite.token, '123')).rejects.toThrow('contact number');
    expect((await call(owner, 'select use_count from tournament_entry_invitations'))[0]).toEqual({ use_count: 0 });
    await submit(captain, club, invite.token); expect((await call(owner, 'select use_count from tournament_entry_invitations'))[0]).toEqual({ use_count: 1 });
    expect(await call(captain, 'select id from tournament_entry_invitations')).toHaveLength(0);
    await expect(call(owner, 'select token_hash from tournament_entry_invitations')).rejects.toThrow('permission denied');
  });
  it.each(['expired','revoked'])('blocks %s links at preview, claim and submission', async state => {
    await configure(); const general = await invitation(); await makePlaceholder(); const reserved = await invitation(placeholder);
    await db.exec(state === 'expired' ? "update tournament_entry_invitations set expires_at=now()-interval '1 hour'" : 'update tournament_entry_invitations set revoked_at=now()');
    await expect(preview(general.token)).rejects.toThrow('invalid'); await expect(submit(captain, club, general.token)).rejects.toThrow('invalid');
    await expect(claim(reserved.token)).rejects.toThrow('invalid');
  });
  it('does not use a team invitation for a different tournament', async () => {
    await configure(); const invite = await invitation();
    await db.exec(`insert into tournaments(id,created_by) values('${other}','${owner}')`);
    await call(owner, "select public.configure_tournament_registration($1,'EXISTING_TEAMS',true,true,false,'','')", [other]);
    await expect(call(captain, "select public.submit_tournament_team_application($1,$2,'+919000000000','',$3)", [other, club, invite.token])).rejects.toThrow('invalid');
    expect((await call(owner, 'select use_count from tournament_entry_invitations'))[0]).toEqual({ use_count: 0 });
  });
  it('claim uses a private reserved place without duplicating an entry, even at full capacity', async () => {
    await makePlaceholder(); await db.exec(`insert into teams(tournament_id,name) values('${tournament}','Second place')`);
    const invite = await invitation(placeholder, captain); await preview(invite.token);
    expect((await claim(invite.token))[0].entry).toBe(placeholder);
    expect((await db.query('select id from teams where tournament_id=$1', [tournament])).rows).toHaveLength(2);
    expect((await db.query('select entity_owner_id from teams where id=$1', [placeholder])).rows[0]).toEqual({ entity_owner_id: owner });
    expect((await db.query('select role,status from team_account_members where team_id=$1', [placeholder])).rows[0]).toEqual({ role: 'CAPTAIN', status: 'ACTIVE' });
    await expect(claim(invite.token)).rejects.toThrow('already used');
  });
  it('reserves a captain link to the selected account and never replaces an existing captain', async () => {
    await makePlaceholder(); const invite = await invitation(placeholder, captain);
    await expect(preview(invite.token, other)).rejects.toThrow('reserved'); await expect(claim(invite.token, other)).rejects.toThrow('reserved');
    await db.exec(`insert into team_players(team_id,player_id,is_captain) values('${placeholder}','${other}',true)`);
    await expect(claim(invite.token)).rejects.toThrow('already has a captain');
  });
  it('creating a replacement claim link revokes the previous link', async () => {
    await makePlaceholder(); const first = await invitation(placeholder); const second = await invitation(placeholder);
    await expect(claim(first.token)).rejects.toThrow('revoked'); expect((await claim(second.token))[0].entry).toBe(placeholder);
  });
  it('refuses a full placeholder roster or an already entered player as captain', async () => {
    await makePlaceholder(); const invite = await invitation(placeholder); await db.exec('update tournaments set players_per_team=1');
    await db.exec(`insert into team_players(team_id,player_id) values('${placeholder}','${other}')`);
    await expect(claim(invite.token)).rejects.toThrow('roster is full');
    await db.exec(`delete from team_players where team_id='${placeholder}'; insert into teams(id,tournament_id,name) values('${other}','${tournament}','Other XI'); insert into team_players(team_id,player_id) values('${other}','${captain}')`);
    await expect(claim(invite.token)).rejects.toThrow('already play');
  });
  it('only organiser creates/revokes links and general links require open team registration', async () => {
    await expect(invitation()).rejects.toThrow('Open team applications');
    await makePlaceholder(); await expect(invitation(placeholder, null, captain)).rejects.toThrow('Only the tournament organiser');
    const invite = await invitation(placeholder);
    await expect(call(captain, 'select public.revoke_tournament_entry_invitation($1)', [invite.invitation_id])).rejects.toThrow('Only the tournament organiser');
    await call(owner, 'select public.revoke_tournament_entry_invitation($1)', [invite.invitation_id]); await expect(claim(invite.token)).rejects.toThrow('revoked');
  });
  it('safe directory reflects entered rosters, with no application or payment fields', async () => {
    await configure(); await review(await submit());
    const rows = await call(other, 'select * from public.list_tournament_roster_players($1)', [tournament]);
    expect(rows[0]).toEqual({ player_id: captain, account_id: captain, display_name: 'Captain', playing_role: 'AR', team_names: ['Club XI'] });
  });
  it('does not expose private directory or anonymous invite execution', async () => {
    await expect(call(other, 'select * from public.list_tournament_roster_players($1)', [tournament])).rejects.toThrow('unavailable');
    await expect(call('', 'select public.preview_tournament_entry_invitation($1)', ['a'.repeat(48)], 'anon')).rejects.toThrow('permission denied');
    await expect(claim('not-a-token')).rejects.toThrow('invalid');
  });
  const poolSubmit = async (account = captain, answers = {}) => (await call<{ id: string }>(account,
    "select public.submit_tournament_player_form($1,'AR','+919000000000','Private note',$2) as id", [tournament, JSON.stringify(answers)]))[0].id;
  const allocate = (id: string, teamId: string | null = placeholder, cap = false, icon = false, account = owner) => call(account,
    'select public.allocate_tournament_player($1,$2,$3,$4)', [id, teamId, cap, icon]);
  const approvePlayer = (id: string) => call(owner, "select public.review_tournament_player_registration($1,'APPROVED',null)", [id]);
  const form = (questions: unknown[], account = owner) => call(account, 'select public.configure_tournament_registration_form($1,$2)', [tournament, JSON.stringify(questions)]);
  const question = { id: 'availability', label: 'Available dates', type: 'TEXT', required: true };
  it('allocates only approved pool players and does not grant captain access for labels', async () => {
    await configure('PLAYER_POOL'); await makePlaceholder(); const id = await poolSubmit();
    await expect(allocate(id)).rejects.toThrow('approved pool'); await approvePlayer(id); await allocate(id, placeholder, true, true);
    expect((await db.query('select role from team_account_members where team_id=$1', [placeholder])).rows).toEqual([{ role: 'PLAYER' }]);
    expect((await db.query('select is_captain from team_players where team_id=$1', [placeholder])).rows).toEqual([{ is_captain: false }]);
    expect((await db.query('select captain_label,icon_label from tournament_player_allocations')).rows).toEqual([{ captain_label: true, icon_label: true }]);
  });
  it('denies self-allocation and cross-tournament assignments', async () => {
    await configure('PLAYER_POOL'); await makePlaceholder(); const id = await poolSubmit(); await approvePlayer(id);
    await expect(allocate(id, placeholder, false, false, captain)).rejects.toThrow('Only the tournament organiser');
    await expect(allocate(id, club)).rejects.toThrow('team in this tournament');
    await expect(call(owner, 'insert into tournament_player_allocations(registration_id,tournament_id,player_id,team_id) values($1,$2,$3,$4)', [id,tournament,captain,placeholder])).rejects.toThrow('permission denied');
  });
  it('moves an allocation atomically and removes former membership', async () => {
    await configure('PLAYER_POOL'); await makePlaceholder(); const id = await poolSubmit(); await approvePlayer(id); await allocate(id);
    await db.exec(`insert into teams(id,tournament_id,name) values('${other}','${tournament}','Second XI')`);
    await allocate(id, other, false, true);
    expect((await db.query('select team_id from team_players where team_id<>$1', [club])).rows).toEqual([{ team_id: other }]);
    expect((await db.query('select team_id from team_account_members where team_id<>$1', [club])).rows).toEqual([{ team_id: other }]);
    expect((await db.query('select team_id from tournament_player_allocations')).rows).toEqual([{ team_id: other }]);
  });
  it('preserves the old allocation when a move exceeds squad capacity', async () => {
    await configure('PLAYER_POOL'); await makePlaceholder(); const first = await poolSubmit(); await approvePlayer(first); await allocate(first);
    await db.exec(`insert into teams(id,tournament_id,name) values('${other}','${tournament}','Second XI'); update tournaments set players_per_team=1`);
    const second = await poolSubmit(other); await approvePlayer(second); await allocate(second, other);
    await expect(allocate(first, other)).rejects.toThrow('roster is full');
    expect((await db.query('select team_id from tournament_player_allocations where registration_id=$1', [first])).rows[0]).toEqual({ team_id: placeholder });
    expect((await db.query('select player_id from team_players where team_id=$1', [placeholder])).rows).toEqual([{ player_id: captain }]);
  });
  it('blocks withdrawal and rejection of allocated players until unassigned', async () => {
    await configure('PLAYER_POOL'); await makePlaceholder(); const id = await poolSubmit(); await approvePlayer(id); await allocate(id);
    await expect(call(captain, 'select public.withdraw_tournament_player_registration($1)', [id])).rejects.toThrow('Remove the team allocation');
    await expect(call(owner, "select public.review_tournament_player_registration($1,'REJECTED',null)", [id])).rejects.toThrow('Remove the team allocation');
    await allocate(id, null); await call(captain, 'select public.withdraw_tournament_player_registration($1)', [id]);
    expect((await db.query('select * from tournament_player_allocations')).rows).toHaveLength(0);
  });
  it('guards existing-team roster edits against duplicate players and overflow', async () => {
    await configure(); await makePlaceholder(); await db.exec(`insert into team_players(team_id,player_id) values('${placeholder}','${captain}'); insert into teams(id,tournament_id,name) values('${other}','${tournament}','Second XI')`);
    await expect(db.exec(`insert into team_players(team_id,player_id) values('${other}','${captain}')`)).rejects.toThrow('another team');
    await db.exec(`update tournaments set players_per_team=1`);
    await expect(db.exec(`insert into team_players(team_id,player_id) values('${placeholder}','${other}')`)).rejects.toThrow('roster is full');
  });
  it('denies bypassing approved pool allocation through legacy roster insertion', async () => {
    await configure('PLAYER_POOL'); await makePlaceholder();
    await expect(db.exec(`insert into team_players(team_id,player_id) values('${placeholder}','${captain}')`)).rejects.toThrow('Allocate an approved pool player');
  });
  it('does not move a player with actual captain permissions through informational labels', async () => {
    await configure('PLAYER_POOL'); await makePlaceholder(); const id = await poolSubmit(); await approvePlayer(id); await allocate(id);
    await db.exec(`update team_players set is_captain=true where team_id='${placeholder}'; update team_account_members set role='CAPTAIN' where team_id='${placeholder}'`);
    await allocate(id, placeholder, false, true);
    expect((await db.query('select role from team_account_members where team_id=$1', [placeholder])).rows[0]).toEqual({ role: 'CAPTAIN' });
    await expect(allocate(id, null)).rejects.toThrow('actual captain role');
  });
  it('enforces organiser-only form configuration and privacy before publication', async () => {
    await expect(form([question], captain)).rejects.toThrow('Only the tournament organiser'); await form([question]);
    expect(await call(other, 'select * from tournament_registration_forms')).toHaveLength(0);
    await configure('PLAYER_POOL'); expect(await call(other, 'select questions from tournament_registration_forms')).toHaveLength(1);
  });
  it('validates question ids, duplicates, labels, types, option values and question count', async () => {
    for (const questions of [[{ ...question, id: '' }], [question,question], [{ ...question, label: '' }], [{ ...question, type: 'INVALID' }],
      [{ ...question, type: 'CHOICE', options: ['one'] }], [{ ...question, type: 'CHOICE', options: ['one','one'] }], Array.from({length:9},(_,i)=>({...question,id:String(i)}))]) {
      await expect(form(questions)).rejects.toThrow();
    }
  });
  it('rejects missing, forged, nontext and oversized answers, including old RPC bypass', async () => {
    await form([question]); await configure('PLAYER_POOL');
    await expect(poolSubmit()).rejects.toThrow('Available dates'); await expect(poolSubmit(captain, { forged: 'secret' })).rejects.toThrow('Unknown');
    await expect(poolSubmit(captain, { availability: 42 })).rejects.toThrow('must be text');
    await expect(poolSubmit(captain, { availability: 'x'.repeat(501) })).rejects.toThrow('500');
    await expect(call(captain, "select public.submit_tournament_player_registration($1,'AR','+919000000000','')", [tournament])).rejects.toThrow('Available dates');
  });
  it('persists answers privately and locks forms after the first player application', async () => {
    await form([question]); await configure('PLAYER_POOL'); const id = await poolSubmit(captain, { availability: 'Saturday' });
    expect((await call(captain, 'select custom_answers from tournament_player_registrations'))[0]).toEqual({ custom_answers: { availability: 'Saturday' } });
    expect(await call(other, 'select custom_answers from tournament_player_registrations')).toHaveLength(0);
    await expect(form([])).rejects.toThrow('form locks'); await approvePlayer(id);
    const directory = await call(other, 'select * from list_registered_tournament_players($1)', [tournament]);
    expect(directory[0]).not.toHaveProperty('custom_answers');
  });
  it('validates choice answers and stores team answers without consuming invalid invitation submissions', async () => {
    await form([{ ...question, type: 'CHOICE', options: ['Saturday','Sunday'] }]); await configure(); const invite = await invitation();
    await expect(call(captain, "select public.submit_tournament_team_form($1,$2,'+919000000000','',$3,$4)", [tournament,club,invite.token,JSON.stringify({availability:'Friday'})])).rejects.toThrow('listed option');
    expect((await call(owner, 'select use_count from tournament_entry_invitations'))[0]).toEqual({ use_count: 0 });
    await call(captain, "select public.submit_tournament_team_form($1,$2,'+919000000000','',$3,$4)", [tournament,club,invite.token,JSON.stringify({availability:'Saturday'})]);
    expect((await call(captain, 'select custom_answers from tournament_team_applications'))[0]).toEqual({ custom_answers: { availability: 'Saturday' } });
    await expect(form([])).rejects.toThrow('form locks');
  });
  it('does not disclose a different private form when another tournament is public', async () => {
    await form([question]);
    await db.exec(`insert into tournaments(id,created_by,name) values('${other}','${owner}','Public other'); update tournaments set visibility='PUBLIC' where id='${other}'; update tournament_registration_settings set published_at=now() where tournament_id='${other}'`);
    expect(await call(captain, 'select * from tournament_registration_forms')).toHaveLength(0);
  });
  it('exposes allocation labels safely only for their published tournament', async () => {
    await configure('PLAYER_POOL'); await makePlaceholder(); const id = await poolSubmit(); await approvePlayer(id); await allocate(id,placeholder,true,true);
    expect(await call(other, 'select captain_label,icon_label from tournament_player_allocations')).toEqual([{ captain_label:true,icon_label:true }]);
    await db.exec(`insert into tournaments(id,created_by,name) values('${other}','${owner}','Public other'); update tournaments set visibility='PRIVATE' where id='${tournament}'; update tournaments set visibility='PUBLIC' where id='${other}'; update tournament_registration_settings set published_at=now() where tournament_id='${other}'`);
    expect(await call(other, 'select * from tournament_player_allocations')).toHaveLength(0);
    expect(await call(captain, 'select * from tournament_player_allocations')).toHaveLength(1);
  });
});
