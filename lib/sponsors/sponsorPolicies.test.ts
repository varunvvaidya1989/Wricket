import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const owner = '11111111-1111-4111-8111-111111111111';
const organizer = '22222222-2222-4222-8222-222222222222';
const outsider = '33333333-3333-4333-8333-333333333333';
const cricket = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const sport = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const privateSport = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const logo = `sport/${sport}/dddddddd-dddd-4ddd-8ddd-dddddddddddd.png`;
const readMigration = (name: string) => readFileSync(resolve(process.cwd(), 'supabase/migrations', name), 'utf8');
const db = new PGlite();

// Execute the real migration and existing authorization functions in PostgreSQL.
// Minimal parent/storage tables stand in for the rest of the Supabase stack.
beforeAll(async () => {
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth; create schema app_private; create schema storage;
    grant usage on schema public, auth, app_private, storage to authenticated, anon;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create table public.tournaments(id uuid primary key, created_by uuid);
    create table public.sport_competitions(id uuid primary key, owner_account_id uuid, visibility text, lifecycle text);
    create table public.sport_competition_access(id uuid default gen_random_uuid(), competition_id uuid, account_id uuid, role text, status text, expires_at timestamptz);
    create table public.sport_competition_entries(id uuid, competition_id uuid);
    create table public.sport_profiles(id uuid, account_id uuid);
    create table public.sport_league_players(entry_id uuid, sport_profile_id uuid);
    create table public.sport_tournament_squads(entry_id uuid);
    create table public.sport_squad_members(squad_entry_id uuid, sport_profile_id uuid);
    grant select on public.tournaments to authenticated;
    create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects(id uuid default gen_random_uuid(), bucket_id text references storage.buckets(id), name text);
    alter table storage.objects enable row level security;
    grant select, insert, delete on storage.objects to authenticated;
    insert into public.tournaments values ('${cricket}', '${owner}');
    insert into public.sport_competitions values ('${sport}', '${owner}', 'PUBLIC', 'LIVE'), ('${privateSport}', '${owner}', 'PRIVATE', 'LIVE');
    insert into public.sport_competition_access(competition_id, account_id, role, status) values ('${sport}', '${organizer}', 'ORGANIZER', 'ACTIVE');
  `);
  const foundation = readMigration('20260817120000_add_sport_competition_foundation.sql');
  const commands = readMigration('20260818100000_add_cloud_competition_commands.sql');
  const manage = foundation.match(/create or replace function app_private\.can_manage_sport_competition\(p_competition_id uuid\)[\s\S]*?\$\$;/)?.[0];
  const read = commands.match(/create or replace function app_private\.can_read_sport_competition\(p_competition_id uuid\)[\s\S]*?\$\$;/)?.[0];
  if (!manage || !read) throw new Error('Existing competition authorization functions not found');
  await db.exec(manage + read);
  await db.exec(readMigration('20260922142523_add_tournament_sponsors.sql'));
}, 30_000);
beforeEach(async () => { await db.exec('begin'); await asAccount(owner); });
afterEach(async () => { await db.exec('rollback'); });
afterAll(async () => { await db.close(); });

async function asAccount(id: string) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
  await db.exec('set role authenticated');
}
async function add(parent = sport, visible = true, path: string | null = null) {
  const column = parent === cricket ? 'cricket_tournament_id' : 'sport_competition_id';
  return db.query<{ id: string; version: number }>(`insert into public.tournament_sponsors(${column}, name, is_visible, logo_path) values ($1, 'Apex', $2, $3) returning id, version`, [parent, visible, path]);
}
const count = async () => (await db.query('select * from public.tournament_sponsors')).rows.length;

describe('tournament sponsorship database permissions', () => {
  it('allows multiple cricket and sport sponsors and supports delegated organizers', async () => {
    await add(cricket); await add(cricket); await add();
    await asAccount(organizer); await add();
    expect(await count()).toBe(4);
  });
  it('hides drafts and private competition sponsors from outsiders', async () => {
    await add(); await add(sport, false); await add(privateSport); await add(cricket, false);
    expect(await count()).toBe(4);
    await asAccount(outsider);
    expect(await count()).toBe(1);
  });
  it('blocks outsider inserts', async () => {
    await asAccount(outsider);
    await expect(add()).rejects.toThrow(/row-level security/);
  });
  it('blocks delegated organizers from managing another competition or cricket tournament', async () => {
    await asAccount(organizer);
    await expect(add(cricket)).rejects.toThrow(/row-level security/);
  });
  it('revokes expired organizer permissions', async () => {
    await db.exec(`reset role; update public.sport_competition_access set expires_at = now() - interval '1 minute'`);
    await asAccount(organizer);
    await expect(add()).rejects.toThrow(/row-level security/);
  });
  it('does not let outsiders update or remove sponsors', async () => {
    const id = (await add()).rows[0].id;
    await asAccount(outsider);
    expect((await db.query('update public.tournament_sponsors set name = $1 where id = $2 returning id', ['Hijacked', id])).rows).toEqual([]);
    expect((await db.query('delete from public.tournament_sponsors where id = $1 returning id', [id])).rows).toEqual([]);
  });
  it('increments versions and rejects stale writes through conditional updates', async () => {
    const id = (await add()).rows[0].id;
    const first = await db.query<{ version: number }>('update public.tournament_sponsors set name = $1 where id = $2 and version = 1 returning version', ['New name', id]);
    expect(first.rows[0].version).toBe(2);
    expect((await db.query('update public.tournament_sponsors set name = $1 where id = $2 and version = 1 returning id', ['Stale', id])).rows).toEqual([]);
  });
  it('prevents moving a sponsor to another tournament', async () => {
    const id = (await add()).rows[0].id;
    await expect(db.query('update public.tournament_sponsors set sport_competition_id = $1 where id = $2', [privateSport, id])).rejects.toThrow(/permission denied/);
  });
  it('requires exactly one real tournament parent', async () => {
    await expect(db.query('insert into public.tournament_sponsors(cricket_tournament_id, sport_competition_id, name) values ($1, $2, $3)', [cricket, sport, 'Invalid'])).rejects.toThrow();
  });
  it('validates website URLs in the database', async () => {
    await expect(db.query('insert into public.tournament_sponsors(sport_competition_id, name, website_url) values ($1, $2, $3)', [sport, 'Invalid', 'javascript:alert(1)'])).rejects.toThrow(/check constraint/);
  });
  it('restricts uploads to tournament organizers and prevents deletion of referenced logos', async () => {
    await db.query("insert into storage.objects(bucket_id, name) values ('sponsor-logos', $1)", [logo]);
    const id = (await add(sport, true, logo)).rows[0].id;
    expect((await db.query('delete from storage.objects returning name')).rows).toEqual([]);
    await db.query('delete from public.tournament_sponsors where id = $1', [id]);
    expect((await db.query('delete from storage.objects returning name')).rows).toHaveLength(1);
  });
  it('only exposes logos referenced by sponsors the viewer can read', async () => {
    await db.query("insert into storage.objects(bucket_id, name) values ('sponsor-logos', $1)", [logo]);
    await add(sport, false, logo);
    await asAccount(outsider);
    expect((await db.query('select * from storage.objects')).rows).toHaveLength(0);
    await asAccount(owner);
    await db.query('update public.tournament_sponsors set is_visible = true');
    await asAccount(outsider);
    expect((await db.query('select * from storage.objects')).rows).toHaveLength(1);
  });
  it('denies outsider logo uploads', async () => {
    await asAccount(outsider);
    await expect(db.query("insert into storage.objects(bucket_id, name) values ('sponsor-logos', $1)", [logo])).rejects.toThrow(/row-level security/);
  });
  it('prevents attaching a logo belonging to a different tournament', async () => {
    await expect(add(privateSport, true, logo)).rejects.toThrow(/check constraint/);
  });
  it('cascades sponsor records when their tournament is deleted', async () => {
    await add(cricket); await add();
    await db.exec(`reset role; delete from public.tournaments where id = '${cricket}'; delete from public.sport_competitions where id = '${sport}'`);
    expect(await count()).toBe(0);
  });
  it('denies anonymous access', async () => {
    await add();
    await db.exec('reset role; set role anon');
    await expect(count()).rejects.toThrow(/permission denied/);
  });
});
