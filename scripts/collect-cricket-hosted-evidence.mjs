import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sourceFingerprint } from './revamp-release-gate.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const target = 'lzgnuqwvsioinwwrsdvn';
const execute = promisify(execFile);
const destination = name => resolve(root, '.e2e/hosted', name);
async function cli(args, artifact) {
  const { stdout, stderr } = await execute(process.execPath, ['node_modules/supabase/dist/supabase.js', ...args], {
    cwd: root, timeout: 120000, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024,
  });
  await writeFile(destination(artifact), stdout + stderr);
  return JSON.parse(stdout);
}
if ((await readFile(resolve(root, 'supabase/.temp/project-ref'), 'utf8')).trim() !== target) throw new Error('Wrong linked project');
const history = await cli(['migration', 'list', '--linked', '--output-format', 'json'], 'migration-history-after.log');
const count = (await readdir(resolve(root, 'supabase/migrations'))).filter(name => /^\d+_.+\.sql$/.test(name)).length;
const matched = history.migrations.length === count && history.migrations.every(row => row.local && row.remote === row.local);
const query = `select jsonb_build_object(
  'tournaments',(select count(*) from public.tournaments),'matches',(select count(*) from public.matches),
  'anonClaim',has_function_privilege('anon','public.claim_cricket_mvp_work(integer)','EXECUTE'),
  'userClaim',has_function_privilege('authenticated','public.claim_cricket_mvp_work(integer)','EXECUTE'),
  'serviceClaim',has_function_privilege('service_role','public.claim_cricket_mvp_work(integer)','EXECUTE'),
  'anonPhone',has_column_privilege('anon','public.tournaments','organizer_phone','SELECT'),
  'userPhone',has_column_privilege('authenticated','public.tournaments','organizer_phone','SELECT'),
  'userHealth',has_function_privilege('authenticated','public.get_cricket_mvp_worker_heartbeat()','EXECUTE'),
  'mvpRealtime',exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='match_mvp_results'),
  'heartbeat',public.get_cricket_mvp_worker_heartbeat(),
  'jobs',coalesce((select jsonb_agg(jsonb_build_object('jobname',jobname,'schedule',schedule,'active',active)) from cron.job
    where jobname in ('wricket-cricket-mvp-worker','wricket-cricket-mvp-monitor')),'[]'::jsonb),
  'queue',coalesce((select jsonb_agg(to_jsonb(q)) from(select status,error,count(*) as jobs from public.match_mvp_calculations group by status,error)q),'[]'::jsonb),
  'responses',coalesce((select jsonb_agg(to_jsonb(r)) from(select status_code,timed_out,content,created from net._http_response
    order by created desc limit 12)r),'[]'::jsonb)
) as evidence`;
const { rows } = await cli(['db', 'query', '--linked', query, '--output', 'json'], 'hosted-postconditions.log');
const backend = rows[0].evidence;
const acceptance = JSON.parse(await readFile(destination('acceptance-evidence.json'), 'utf8'));
const permissions = !backend.anonClaim && !backend.userClaim && backend.serviceClaim
  && !backend.anonPhone && !backend.userPhone && !backend.userHealth && backend.mvpRealtime;
const dataIssues = backend.queue.filter(row => row.status === 'FAILED').reduce((sum, row) => sum + row.jobs, 0);
const active = backend.jobs.length === 2 && backend.jobs.every(job => job.active);
const heartbeatFresh = !!backend.heartbeat.lastSuccess && backend.heartbeat.ageSeconds < 90;
const status = { recordedAt: new Date().toISOString(), verifiedBy: 'Codex hosted backend acceptance',
  sourceFingerprint: await sourceFingerprint(root), projectRef: target, migrationCount: count,
  migrationAuditPassed: matched && permissions, backendPermissionsPassed: permissions,
  workerAcceptancePassed: acceptance.passed && acceptance.cleaned, schedulesActive: active,
  workerHeartbeatFresh: heartbeatFresh, dataIssues, workerHealthy: active && heartbeatFresh && dataIssues === 0,
  backend, acceptanceCases: acceptance.cases };
await writeFile(destination('final-status.json'), JSON.stringify(status, null, 2));
console.log(JSON.stringify({ migrationsMatched: matched, migrationCount: count,
  backendPermissionsPassed: permissions, workerAcceptancePassed: status.workerAcceptancePassed,
  schedulesActive: active, workerHeartbeatFresh: heartbeatFresh, dataIssues }));
