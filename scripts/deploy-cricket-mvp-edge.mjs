import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomBytes, createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const ref = 'lzgnuqwvsioinwwrsdvn';
const output = resolve(root, '.e2e/hosted');
const execute = promisify(execFile);
const steps = [];
async function cli(args, label) {
  try {
    const result = await execute(process.execPath, ['node_modules/supabase/dist/supabase.js', ...args], {
      cwd: root, timeout: 180000, maxBuffer: 8 * 1024 * 1024, encoding: 'utf8',
    });
    await writeFile(resolve(output, `${label}.log`), result.stdout + result.stderr);
    steps.push(label);
    console.log(`PASS ${label}`);
    return result.stdout;
  } catch {
    throw new Error(`Deployment step failed: ${label}. Credentials and raw SQL are intentionally omitted.`);
  }
}

async function main() {
  if (!process.argv.includes('--production')) throw new Error('Use --production explicitly.');
  if ((await readFile(resolve(root, 'supabase/.temp/project-ref'), 'utf8')).trim() !== ref) throw new Error('Wrong linked project.');
  await mkdir(output, { recursive: true });
  await execute(process.execPath, ['scripts/build-cricket-mvp-edge.mjs', '--check'], { cwd: root });
  const query = JSON.parse(await cli(['db', 'query', '--linked',
    "select exists(select 1 from supabase_migrations.schema_migrations where version='20261011093749') as monitoring_ready", '--output', 'json'], 'worker-deployment-precondition'));
  if (!query.rows?.[0]?.monitoring_ready) throw new Error('Apply the verified monitoring migration first.');
  const envFile = resolve(output, 'mvp-worker.env');
  let token;
  try { token = (await readFile(envFile, 'utf8')).match(/^WRICKET_MVP_CRON_TOKEN=([a-f0-9]{64})$/m)?.[1]; }
  catch (cause) { if (cause.code !== 'ENOENT') throw cause; }
  token ??= randomBytes(32).toString('hex');
  await writeFile(envFile, `WRICKET_MVP_CRON_TOKEN=${token}\n`, { mode: 0o600 });
  await cli(['secrets', 'set', '--project-ref', ref, '--env-file', envFile], 'worker-secret-installed');
  await cli(['functions', 'deploy', 'cricket-mvp-worker', '--project-ref', ref, '--use-api'], 'edge-worker-deployed');

  // Secret lives in Vault, not in the Cron command or app configuration.
  const sql = `create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
do $vault$
declare existing uuid;
begin
  select id into existing from vault.secrets where name='wricket_mvp_cron_token';
  if existing is null then
    perform vault.create_secret('${token}','wricket_mvp_cron_token','Dedicated cricket MVP scheduler credential');
  else
    perform vault.update_secret(existing,'${token}','wricket_mvp_cron_token','Dedicated cricket MVP scheduler credential');
  end if;
end $vault$;
select cron.schedule('wricket-cricket-mvp-worker','10 seconds', $job$
  select net.http_post(
    url:='https://${ref}.supabase.co/functions/v1/cricket-mvp-worker',
    headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' ||
      (select decrypted_secret from vault.decrypted_secrets where name='wricket_mvp_cron_token')),
    body:='{"mode":"worker"}'::jsonb, timeout_milliseconds:=60000);
$job$);
select cron.schedule('wricket-cricket-mvp-monitor','* * * * *', $job$
  select net.http_post(
    url:='https://${ref}.supabase.co/functions/v1/cricket-mvp-worker',
    headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' ||
      (select decrypted_secret from vault.decrypted_secrets where name='wricket_mvp_cron_token')),
    body:='{"mode":"monitor"}'::jsonb, timeout_milliseconds:=60000);
$job$);
select cron.alter_job(jobid,active:=true) from cron.job
  where jobname in ('wricket-cricket-mvp-worker','wricket-cricket-mvp-monitor');`;
  const sqlFile = resolve(output, 'install-mvp-schedule.sql');
  await writeFile(sqlFile, sql, { mode: 0o600 });
  await cli(['db', 'query', '--linked', '--file', sqlFile, '--output', 'json'], 'worker-schedules-installed');
  const functionURL = `https://${ref}.supabase.co/functions/v1/cricket-mvp-worker`;
  // Only aggregate summaries are retained; the token never enters logs or reports.
  const response = await fetch(functionURL, { method: 'POST', headers: {
    Authorization: `Bearer ${token}`, 'Content-Type': 'application/json',
  }, body: '{"mode":"worker"}', signal: AbortSignal.timeout(60000), redirect: 'error' });
  const summary = await response.json();
  await writeFile(resolve(output, 'worker-first-invocation.json'), JSON.stringify({ status: response.status, summary }, null, 2));
  const handler = await readFile(resolve(root, 'supabase/functions/cricket-mvp-worker/handler.mjs'));
  await writeFile(resolve(output, 'worker-deployment.json'), JSON.stringify({ at: new Date().toISOString(),
    projectRef: ref, steps, functionURL, workerSchedule: '10 seconds', monitorSchedule: '* * * * *',
    handlerSha256: createHash('sha256').update(handler).digest('hex'), firstInvocationStatus: response.status,
    status: response.ok ? 'DEPLOYED_AWAITING_ACCEPTANCE' : 'DEPLOYED_REQUIRES_INVESTIGATION' }, null, 2));
  console.log(JSON.stringify({ deployed: true, firstInvocationStatus: response.status, ...summary }));
  if (!response.ok) process.exitCode = 2;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await main(); } catch (cause) { console.error(cause.message); process.exitCode = 1; }
}
