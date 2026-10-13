import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

let db: PGlite;
const account = '00000000-0000-4000-8000-000000000001';
describe('profile deletion with current Storage restrictions', () => {
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`create role anon; create role authenticated; create schema app_private; create schema storage;
      create table profiles(id uuid primary key); create table storage.objects(bucket_id text,name text);
      create function storage.foldername(text) returns text[] language sql as $$select (string_to_array($1,'/'))[1:1]$$;
      create function storage.protect_delete() returns trigger language plpgsql as $$begin raise exception 'Direct Storage deletion is forbidden'; end$$;
      create trigger protect_objects_delete before delete on storage.objects for each statement execute function storage.protect_delete();`);
    await db.exec(readFileSync(new URL('../../../supabase/migrations/20261011095737_avoid_direct_profile_media_deletion.sql', import.meta.url), 'utf8'));
    await db.exec('create trigger profile_media_cleanup before delete on profiles for each row execute function app_private.delete_profile_avatar_media()');
  });
  afterAll(async () => { await db?.close(); });
  it('deletes an account with no media without attempting a forbidden Storage DELETE', async () => {
    await db.query('insert into profiles values($1)', [account]);
    await db.query('delete from profiles where id=$1', [account]);
    expect((await db.query('select * from profiles')).rows).toHaveLength(0);
  });
  it('retains account and media until files have been removed through the Storage API', async () => {
    await db.query('insert into profiles values($1)', [account]);
    await db.query('insert into storage.objects values($1,$2)', ['profile-media', `${account}/avatar.jpg`]);
    await expect(db.query('delete from profiles where id=$1', [account])).rejects.toThrow('Storage API');
    expect((await db.query('select * from profiles')).rows).toHaveLength(1);
    expect((await db.query('select * from storage.objects')).rows).toHaveLength(1);
  });
});
