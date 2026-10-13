import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { afterAll, beforeAll, expect, it } from 'vitest';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role authenticated; create role anon; create schema auth; create schema app_private;
    grant usage on schema app_private,auth to authenticated,anon;
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.account',true),'')::uuid $$;
    create table profiles(id uuid primary key, display_name text, phone text);
    create table tournaments(id uuid primary key,owner_id uuid,visibility text);
    create table match_moments(id uuid primary key,tournament_id uuid,author_id uuid,status text);
    create table moment_comments(moment_id uuid,author_id uuid,status text);
    create function app_private.can_view_tournament_social(p uuid) returns boolean language sql as $$ select exists(select 1 from public.tournaments where id=p and (visibility='PUBLIC' or owner_id=auth.uid())) $$;
    insert into profiles values('${id(1)}','Organiser','private phone'),('${id(2)}','Commenter','other private phone'),('${id(3)}','Unrelated','hidden'),('${id(4)}','Removed author','hidden');
    insert into tournaments values('${id(10)}','${id(1)}','PUBLIC'),('${id(11)}','${id(1)}','PRIVATE');
    insert into match_moments values('${id(20)}','${id(10)}','${id(1)}','PUBLISHED'),('${id(21)}','${id(10)}','${id(4)}','REMOVED'),('${id(22)}','${id(11)}','${id(1)}','PUBLISHED');
    insert into moment_comments values('${id(20)}','${id(2)}','PUBLISHED'),('${id(20)}','${id(3)}','REMOVED'),('${id(21)}','${id(4)}','PUBLISHED');`);
  await db.exec(readFileSync(new URL('../../../supabase/migrations/20261011050334_expose_visible_moment_author_names.sql', import.meta.url), 'utf8'));
});
afterAll(async () => { await db?.close(); });
const read = (tournament: string, account = id(2), role = 'authenticated') => db.transaction(async tx => {
  await tx.query("select set_config('test.account',$1,true)", [account]);
  await tx.exec(`set local role ${role}`);
  return tx.query('select * from public.list_visible_moment_author_names($1) order by profile_id', [tournament]);
});
it('returns only display names for visible authors/commenters, excluding contact and removed content', async () => {
  expect((await read(id(10))).rows).toEqual([{ profile_id: id(1), display_name: 'Organiser' }, { profile_id: id(2), display_name: 'Commenter' }]);
});
it('denies another tournament and anonymous access', async () => {
  await expect(read(id(11))).rejects.toThrow('unavailable');
  await expect(read(id(10), '', 'anon')).rejects.toThrow('permission denied');
});
it('does not make the full profiles table readable', async () => {
  await expect(db.transaction(async tx => { await tx.exec('set local role authenticated'); await tx.query('select phone from profiles'); })).rejects.toThrow('permission denied');
});
