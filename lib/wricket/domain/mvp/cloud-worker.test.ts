import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { cloudMvpInput, type CloudMvpSnapshot } from './cloud-input';
import { calculateMatchMvp } from './calculator';

const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const matchId = id(1), playerA = id(2), playerB = id(3), teamA = id(4), teamB = id(5), innings = id(6);
let db: PGlite;
type Job = { matchId: string; leaseToken: string; snapshot: CloudMvpSnapshot };
async function claim(): Promise<Job[]> {
  return (await db.query<{ jobs: Job[] }>('select public.claim_cricket_mvp_work(10) as jobs')).rows[0].jobs;
}
const finish = (job: Job, result: unknown, error: string | null = null) => db.query<{ accepted: boolean }>('select public.finish_cricket_mvp_work($1,$2,$3,$4) as accepted', [job.matchId, job.leaseToken, JSON.stringify(result), error]);

describe('authoritative MVP worker on PostgreSQL', () => {
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema app_private; grant usage on schema public to anon,authenticated,service_role;
      create schema auth;
      create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create table tournament_members(tournament_id uuid,account_id uuid,status text,role text);
      grant usage on schema app_private to anon,authenticated;
      create table profiles(id uuid primary key); create table players(id uuid primary key);
      create table teams(id uuid primary key);
      create table matches(id uuid primary key,tournament_id uuid,format text,status text,result jsonb,rules jsonb);
      create table match_xis(match_id uuid,player_id uuid,team_id uuid,batting_order integer);
      create table match_innings(id uuid,match_id uuid,batting_team_id uuid,bowling_team_id uuid,sequence integer);
      create table match_events(id uuid primary key default gen_random_uuid(),match_id uuid,client_event_id text,sequence integer,kind text,payload jsonb);
      create function app_private.request_match_mvp_recalculation(uuid) returns jsonb language sql as $$select '{}'::jsonb$$;`);
    const foundation = readFileSync(new URL('../../../../supabase/migrations/20260730120000_add_mvp_awards.sql', import.meta.url), 'utf8');
    await db.exec(foundation.slice(0, foundation.indexOf('alter table public.match_mvp_results enable')));
    await db.exec(readFileSync(new URL('../../../../supabase/migrations/20261011041316_add_cricket_mvp_worker.sql', import.meta.url), 'utf8'));
    await db.exec(readFileSync(new URL('../../../../supabase/migrations/20261011042612_grant_cricket_mvp_worker_schema_access.sql', import.meta.url), 'utf8'));
    await db.exec(readFileSync(new URL('../../../../supabase/migrations/20261011093749_add_cricket_mvp_worker_monitoring.sql', import.meta.url), 'utf8'));
    await db.exec(readFileSync(new URL('../../../../supabase/migrations/20261011094408_support_legacy_cricket_mvp_rule_snapshots.sql', import.meta.url), 'utf8'));
    await db.exec('create trigger enqueue after update of status,result on matches for each row execute function app_private.enqueue_match_mvp_after_result_change()');
  });
  afterAll(async () => { await db?.close(); });
  beforeEach(async () => {
    await db.exec(`truncate players,teams,matches,match_xis,match_innings,match_events,match_mvp_results,match_mvp_calculations,tournament_members cascade;
      insert into players values('${playerA}'),('${playerB}'); insert into teams values('${teamA}'),('${teamB}');
      insert into matches values('${matchId}',null,'TURF','IN_PROGRESS','{"kind":"WIN_BY_RUNS","winnerTeamId":"${teamA}"}','{"oversPerInnings":1}');
      insert into match_xis values('${matchId}','${playerA}','${teamA}',1),('${matchId}','${playerB}','${teamB}',1);
      insert into match_innings values('${innings}','${matchId}','${teamA}','${teamB}',1);
      insert into match_events(match_id,client_event_id,sequence,kind,payload) values
        ('${matchId}','ball',1,'BALL_RECORDED','{"innings_id":"${innings}","striker_id":"${playerA}","bowler_id":"${playerB}","runs_bat":4,"runs_extra":0,"is_legal":true}');
      update matches set status='COMPLETED';`);
  });
  it('claims a coherent canonical history once and persists calculated rankings for another client', async () => {
    const jobs = await claim(); expect(jobs).toHaveLength(1); expect(await claim()).toEqual([]);
    const result = calculateMatchMvp(cloudMvpInput(jobs[0].snapshot));
    expect(result.rankings.find(row => row.playerId === playerA)?.battingBreakdown.runs).toBe(4);
    expect((await finish(jobs[0], result)).rows[0].accepted).toBe(true);
    expect((await db.query('select count(*)::int as n from match_mvp_results')).rows).toEqual([{ n: 2 }]);
    expect((await finish(jobs[0], result)).rows[0].accepted).toBe(false);
  });
  it('the service role can use the exposed invoker wrappers through the private schema', async () => {
    const jobs = await db.transaction(async tx => { await tx.exec('set local role service_role'); return tx.query<{ jobs: Job[] }>('select public.claim_cricket_mvp_work(10) as jobs'); });
    expect(jobs.rows[0].jobs).toHaveLength(1);
  });
  it('rejects stale work after a correction, erases stale totals and recalculates effective deliveries', async () => {
    const old = (await claim())[0]; const original = calculateMatchMvp(cloudMvpInput(old.snapshot));
    await finish(old, original);
    await db.query('insert into match_events(match_id,client_event_id,sequence,kind,payload) values($1,$2,2,$3,$4)', [matchId,'undo','BALL_CORRECTED',JSON.stringify({ target_client_event_id: 'ball' })]);
    expect((await db.query('select match_id from match_mvp_results')).rows).toHaveLength(0);
    const correction = (await claim())[0];
    expect((await finish(old, original)).rows[0].accepted).toBe(false);
    const corrected = calculateMatchMvp(cloudMvpInput(correction.snapshot));
    expect(corrected.rankings.every(row => row.battingBreakdown.runs === 0)).toBe(true);
    await finish(correction, corrected);
  });
  it('does not publish a stale calculation after a result changes', async () => {
    const job = (await claim())[0];
    await db.exec("update matches set result='{\"kind\":\"NO_RESULT\"}'");
    expect((await finish(job, calculateMatchMvp(cloudMvpInput(job.snapshot)))).rows[0].accepted).toBe(false);
    const retry = (await claim())[0]; await finish(retry, calculateMatchMvp(cloudMvpInput(retry.snapshot)));
    expect((await db.query('select match_id from match_mvp_results')).rows).toHaveLength(0);
  });
  it('rolls back a whole replacement when one ranking has an invalid participant', async () => {
    const job = (await claim())[0]; const result = calculateMatchMvp(cloudMvpInput(job.snapshot));
    result.rankings[1].playerId = id(99);
    await expect(finish(job, result)).rejects.toThrow('not in the playing side');
    expect((await db.query('select match_id from match_mvp_results')).rows).toHaveLength(0);
    expect((await db.query('select status from match_mvp_calculations')).rows).toEqual([{ status: 'CALCULATING' }]);
  });
  it('reclaims an expired lease and makes the old worker harmless', async () => {
    const old = (await claim())[0]; await db.exec("update match_mvp_calculations set updated_at=now()-interval '6 minutes'");
    const next = (await claim())[0]; expect(next.leaseToken).not.toBe(old.leaseToken);
    expect((await finish(old, calculateMatchMvp(cloudMvpInput(old.snapshot)))).rows[0].accepted).toBe(false);
  });
  it.each(['anon','authenticated'])('denies %s callers the ability to claim or publish rankings', async role => {
    await expect(db.transaction(async tx => { await tx.exec(`set local role ${role}`); await tx.exec('select public.claim_cricket_mvp_work(1)'); })).rejects.toThrow('permission denied');
  });
  it('persists a failure without deleting previous valid rankings', async () => {
    const job = (await claim())[0]; await finish(job, null, 'worker unavailable');
    expect((await db.query('select status,error from match_mvp_calculations')).rows).toEqual([{ status: 'FAILED', error: 'worker unavailable' }]);
  });
  it('records private aggregate heartbeat through service-only invoker wrappers', async () => {
    const result = await db.transaction(async tx => {
      await tx.exec('set local role service_role');
      await tx.query('select public.record_cricket_mvp_worker_heartbeat($1)', [JSON.stringify({ claimed: 2, completed: 1, superseded: 1, failed: 0, secret: 'must not persist' })]);
      return tx.query<{ health: { counts: object; lastSuccess: string } }>('select public.get_cricket_mvp_worker_heartbeat() as health');
    });
    expect(result.rows[0].health.counts).toEqual({ claimed: 2, completed: 1, superseded: 1, failed: 0 });
    expect(result.rows[0].health.lastSuccess).toBeTruthy();
    await expect(db.query('select public.record_cricket_mvp_worker_heartbeat($1)', [JSON.stringify({ claimed: 1, completed: 2, superseded: 0, failed: 0 })])).rejects.toThrow('Invalid worker counts');
  });
  it.each(['anon', 'authenticated'])('denies %s callers health reads and heartbeat forgery', async role => {
    await expect(db.transaction(async tx => {
      await tx.exec(`set local role ${role}`);
      await tx.exec('select public.get_cricket_mvp_worker_heartbeat()');
    })).rejects.toThrow('permission denied');
    await expect(db.transaction(async tx => {
      await tx.exec(`set local role ${role}`);
      await tx.exec(`select public.record_cricket_mvp_worker_heartbeat('{"claimed":0,"completed":0,"superseded":0,"failed":0}')`);
    })).rejects.toThrow('permission denied');
  });
  it('only an authorised administrator can reset an exhausted retry budget and old lease', async () => {
    const tournament = id(20), account = id(21);
    await db.query('insert into profiles values($1)', [account]);
    await db.query('update matches set tournament_id=$1 where id=$2', [tournament,matchId]);
    await db.query("insert into tournament_members values($1,$2,'ACTIVE','OWNER')", [tournament,account]);
    await db.exec("update match_mvp_calculations set status='FAILED',attempts=3,lease_token=gen_random_uuid()");
    await db.transaction(async tx => {
      await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [id(22)]);
      await expect(tx.query('select app_private.request_match_mvp_recalculation($1)', [matchId])).rejects.toThrow('administrator access');
    });
    await db.transaction(async tx => {
      await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [account]);
      await tx.query('select app_private.request_match_mvp_recalculation($1)', [matchId]);
    });
    expect((await db.query('select status,attempts,lease_token from match_mvp_calculations')).rows).toEqual([{ status: 'PENDING', attempts: 0, lease_token: null }]);
  });
});
