import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../..');
const migration = readFileSync(resolve(root, 'supabase/migrations/20261118130351_add_private_onboarding_details.sql'), 'utf8');
const sportsMigration = readFileSync(resolve(root, 'supabase/migrations/20260810131430_allow_multiple_sport_selection.sql'), 'utf8');
const saveSports = sportsMigration.slice(0, sportsMigration.indexOf('create or replace function public.save_my_sports'));
const existing = '00000000-0000-4000-8000-000000000001';
const fresh = '00000000-0000-4000-8000-000000000002';
let db: PGlite;
async function asUser(id: string, sql: string, params: unknown[] = []) {
  await db.exec('set role authenticated');
  try {
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
    return await db.query(sql, params);
  } finally { await db.exec('reset role'); }
}
const complete = (overrides: Record<string, unknown> = {}) => {
  const input = { name: 'New Player', email: ' parent@example.test ', phone: '+919876543210', sports: ['CRICKET'], primary: 'CRICKET', age: null, country: null, state: null, city: null, ...overrides };
  return asUser(fresh, 'select public.complete_my_account_details($1,$2,$3,$4,$5,$6,$7,$8,$9)', Object.values(input));
};
describe('private onboarding completion migration', () => {
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`create role authenticated; create role anon; create schema auth; create schema app_private;
      grant usage on schema auth,app_private to authenticated,anon;
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create table profiles(id uuid primary key, display_name text, primary_sport_id uuid, onboarding_status text, onboarding_completed_at timestamptz, updated_at timestamptz);
      create table sports(id uuid primary key default gen_random_uuid(),code text,name text,availability_status text);
      create table account_sports(account_id uuid references profiles(id) on delete cascade,sport_id uuid,access_status text,is_primary boolean,updated_at timestamptz,primary key(account_id,sport_id));
      create table players(id uuid primary key default gen_random_uuid(),profile_id uuid unique references profiles(id) on delete cascade,display_name text);
      create function app_private.create_my_player_profile(p_display_name text) returns uuid language plpgsql as $$declare result uuid; begin
        if current_setting('test.fail_player',true)='yes' then raise exception 'Player save failed'; end if;
        insert into public.players(profile_id,display_name) values(auth.uid(),p_display_name) on conflict(profile_id) do update set display_name=excluded.display_name returning id into result; return result;
      end$$;
      insert into profiles values('${existing}','Existing Player',null,'COMPLETED',now(),now()),('${fresh}','New Player',null,'SPORT_REQUIRED',null,now());
      insert into sports(code,name,availability_status) values('CRICKET','Cricket','AVAILABLE'),('TENNIS','Tennis','AVAILABLE');`);
    await db.exec(saveSports); await db.exec(migration);
  });
  afterAll(async () => { await db?.close(); });
  beforeEach(async () => {
    await db.exec(`delete from account_details where account_id='${fresh}'; delete from players; delete from account_sports;
      update profiles set onboarding_status='SPORT_REQUIRED',primary_sport_id=null where id='${fresh}';`);
    await db.query("select set_config('test.fail_player','no',false)");
  });
  it('grandfathers existing completed users without marking incomplete accounts done', async () => {
    const rows = (await db.query('select account_id,completed_at is not null as completed from account_details')).rows;
    expect(rows).toEqual([{ account_id: existing, completed: true }]);
  });
  it('saves required-only details, selected sports and canonical player in one transaction', async () => {
    await complete();
    expect((await asUser(fresh, 'select contact_email,contact_phone,age,country_code,completed_at is not null as completed from account_details')).rows).toEqual([
      { contact_email: 'parent@example.test', contact_phone: '+919876543210', age: null, country_code: null, completed: true },
    ]);
    expect((await db.query('select count(*)::int as count from players')).rows[0]).toEqual({ count: 1 });
    await complete(); expect((await db.query('select count(*)::int as count from account_details where account_id=$1', [fresh])).rows[0]).toEqual({ count: 1 });
  });
  it('keeps private details invisible to another signed-in user and denies direct writes', async () => {
    await complete();
    expect((await asUser(existing, 'select contact_email from account_details where account_id=$1', [fresh])).rows).toEqual([]);
    await expect(asUser(fresh, "update account_details set contact_email='other@example.test'")).rejects.toThrow('permission denied');
    await db.exec('set role anon');
    try { await expect(db.query('select * from account_details')).rejects.toThrow('permission denied'); }
    finally { await db.exec('reset role'); }
  });
  it.each([{ email: '' }, { phone: '9876543210' }, { name: '' }, { age: 121 }, { state: 'Maharashtra' }, { city: 'Mumbai' }, { sports: [] }, { primary: 'FOOTBALL' }])('rejects incomplete or inconsistent data %j', async values => {
    await expect(complete(values)).rejects.toThrow();
    expect((await db.query('select * from account_details where account_id=$1', [fresh])).rows).toEqual([]);
  });
  it('rolls back sport/profile completion if canonical player creation fails', async () => {
    await db.query("select set_config('test.fail_player','yes',false)");
    await expect(complete()).rejects.toThrow('Player save failed');
    expect((await db.query('select onboarding_status from profiles where id=$1', [fresh])).rows[0]).toEqual({ onboarding_status: 'SPORT_REQUIRED' });
    expect((await db.query('select * from account_sports')).rows).toEqual([]);
  });
  it('accepts optional linked location and a zero age', async () => {
    await complete({ age: 0, country: 'IN', state: 'Maharashtra', city: 'Mumbai' });
    expect((await asUser(fresh, 'select age,country_code,state_name,city from account_details')).rows[0]).toEqual({ age: 0, country_code: 'IN', state_name: 'Maharashtra', city: 'Mumbai' });
  });
});
