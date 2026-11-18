import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

let db: PGlite;
const owner = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';
const migration = new URL('../../../supabase/migrations/20261013142242_repair_account_deletion_storage_flow.sql', import.meta.url);
const avatarMigration = new URL('../../../supabase/migrations/20261011095737_avoid_direct_profile_media_deletion.sql', import.meta.url);
async function account(id = owner) {
  await db.query('insert into auth.users values ($1);', [id]);
  await db.query('insert into public.profiles values ($1);', [id]);
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
}
describe('account deletion with protected Storage and shared sport records', () => {
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`create role anon; create role authenticated; create schema auth; create schema app_private; create schema storage;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create table public.profiles(id uuid primary key references auth.users(id) on delete cascade);
      create table public.sport_profiles(id uuid primary key, account_id uuid references profiles(id) on delete cascade);
      create table public.tournaments(id uuid primary key,created_by uuid references profiles(id) on delete restrict);
      create table public.match_moments(id uuid primary key,tournament_id uuid references tournaments(id) on delete cascade,author_id uuid references profiles(id) on delete restrict);
      create table public.moment_media(moment_id uuid references match_moments(id) on delete cascade,storage_path text);
      create table public.moment_comments(author_id uuid references profiles(id) on delete restrict);
      create table public.tournament_scorers(assigned_by uuid references profiles(id) on delete restrict);
      create table public.tournament_sponsors(logo_path text);
      create table public.shared_history(account_id uuid references profiles(id) on delete restrict);
      create table public.shared_lineup(sport_profile_id uuid references sport_profiles(id) on delete restrict);
      create table storage.objects(bucket_id text,name text,owner_id text);
      create function storage.foldername(text) returns text[] language sql as $$select (string_to_array($1,'/'))[1:1]$$;
      create function storage.protect_delete() returns trigger language plpgsql as $$begin raise exception 'Direct Storage deletion is forbidden'; end$$;
      create trigger protect_delete before delete on storage.objects for each statement execute function storage.protect_delete();
      create function app_private.delete_owned_tournament(uuid) returns void language sql as $$delete from public.tournaments where id=$1 and created_by=auth.uid()$$;
      alter table storage.objects enable row level security;
      create policy existing_storage_policy on storage.objects for all to authenticated using(true) with check(true);
      grant usage on schema public,auth,app_private,storage to authenticated;
      grant select on profiles to authenticated; grant select,insert,delete on storage.objects to authenticated;`);
    await db.exec(readFileSync(avatarMigration, 'utf8'));
    await db.exec('create trigger avatar_cleanup before delete on profiles for each row execute function app_private.delete_profile_avatar_media()');
    await db.exec(readFileSync(migration, 'utf8'));
  });
  afterAll(async () => { await db?.close(); });
  it('rejects unauthenticated and NULL confirmation calls', async () => {
    await expect(db.query('select * from public.list_my_account_deletion_media($1)', ['DELETE'])).rejects.toThrow('SIGN_IN');
    await account();
    await expect(db.query('select * from public.list_my_account_deletion_media($1)', [null])).rejects.toThrow('CONFIRMATION');
  });
  it('blocks shared history before returning a media-removal manifest', async () => {
    await db.query('insert into shared_history values($1)', [owner]);
    await expect(db.query("select * from public.list_my_account_deletion_media('DELETE')")).rejects.toThrow('SHARED_RECORDS');
    await db.query('delete from shared_history where account_id=$1', [owner]);
    await db.query('insert into sport_profiles values($1,$1)', [owner]);
    await db.query('insert into shared_lineup values($1)', [owner]);
    await expect(db.query("select * from public.list_my_account_deletion_media('DELETE')")).rejects.toThrow('SHARED_RECORDS');
    await db.query('delete from shared_lineup where sport_profile_id=$1', [owner]);
  });
  it('scopes files to the caller and retains the account while files remain', async () => {
    await account(other);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
    await db.query("insert into storage.objects values('profile-media',$1,$2),('profile-media',$3,$4)", [`${owner}/a.jpg`, owner, `${other}/b.jpg`, other]);
    const manifest = await db.query<{ storage_path: string }>("select * from public.list_my_account_deletion_media('DELETE')");
    expect(manifest.rows.map(x => x.storage_path)).toEqual([`${owner}/a.jpg`]);
    await expect(db.query("select app_private.delete_my_sportstage_account('DELETE')")).rejects.toThrow('MEDIA_REMAINS');
    expect((await db.query('select * from profiles')).rows).toHaveLength(2);
  });
  it('deletes media-free owned cricket records without direct Storage DELETE and denies a retained JWT', async () => {
    // This isolated metadata fixture emulates a completed Storage API removal.
    // No real Storage tables or protection settings are modified by the test.
    await db.exec('alter table storage.objects disable trigger protect_delete');
    await db.query('delete from storage.objects where owner_id=$1', [owner]);
    await db.exec('alter table storage.objects enable trigger protect_delete');
    await db.query('insert into tournaments values($1,$1)', [owner]);
    await db.query("select app_private.delete_my_sportstage_account('DELETE')");
    expect((await db.query('select * from auth.users')).rows).toEqual([{ id: other }]);
    expect((await db.query('select * from tournaments')).rows).toHaveLength(0);
    await db.exec('set role authenticated');
    try {
      await expect(db.query("insert into storage.objects values('profile-media',$1,$2)", [`${owner}/new.jpg`, owner])).rejects.toThrow('row-level security');
      expect((await db.query('select * from storage.objects')).rows).toHaveLength(0);
    } finally { await db.exec('reset role'); }
    expect((await db.query('select name from storage.objects')).rows).toEqual([{ name: `${other}/b.jpg` }]);
  });
});
