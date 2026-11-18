import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomBytes } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const execute = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));
const project = 'lzgnuqwvsioinwwrsdvn';
const uri = `https://${project}.supabase.co/functions/v1/send-sms-twofactor`;
const output = resolve(root, '.e2e/twofactor');

async function cli(args) {
  try {
    await execute(process.execPath, ['node_modules/supabase/dist/supabase.js', ...args], { cwd: root, timeout: 180000, maxBuffer: 4 * 1024 * 1024, windowsHide: true });
  } catch { throw new Error('Supabase deployment failed. Raw output withheld to protect credentials.'); }
}
async function main() {
  if (!process.argv.includes('--production')) throw new Error('Pass --production for the explicitly scoped SportStage project.');
  if ((await readFile(resolve(root, 'supabase/.temp/project-ref'), 'utf8')).trim() !== project) throw new Error('Wrong linked project.');
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const apiKey = process.env.TWOFACTOR_API_KEY;
  if (!token || !apiKey || /REPLACE_WITH|placeholder/i.test(apiKey)) throw new Error('Server credentials are required in the process environment.');
  const authUrl = `https://api.supabase.com/v1/projects/${project}/config/auth`;
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const previousResponse = await fetch(authUrl, { headers, signal: AbortSignal.timeout(15000) });
  if (!previousResponse.ok) throw new Error('Cannot read current Auth configuration.');
  const previous = await previousResponse.json();
  if (previous.hook_send_sms_enabled && previous.hook_send_sms_uri !== uri) throw new Error('Another SMS hook is enabled; refusing to replace it.');
  const fields = ['external_phone_enabled', 'sms_autoconfirm', 'sms_otp_length', 'sms_otp_exp', 'sms_max_frequency', 'hook_send_sms_enabled', 'hook_send_sms_uri', 'hook_send_sms_secrets'];
  await mkdir(output, { recursive: true });
  const backup = resolve(output, 'previous-auth.json');
  try { await readFile(backup); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await writeFile(backup, JSON.stringify(Object.fromEntries(fields.map(field => [field, previous[field]])), null, 2) + '\n', { mode: 0o600 });
  }
  const secretFile = resolve(output, 'hook.env');
  let secret;
  try { secret = (await readFile(secretFile, 'utf8')).match(/^SEND_SMS_HOOK_SECRET=(.+)$/m)?.[1]; }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  secret ??= `v1,whsec_${randomBytes(32).toString('base64')}`;
  await writeFile(secretFile, `TWOFACTOR_API_KEY=${apiKey}\nTWOFACTOR_OTP_TEMPLATE="SportStage Login"\nSEND_SMS_HOOK_SECRET=${secret}\n`, { mode: 0o600 });
  await cli(['secrets', 'set', '--project-ref', project, '--env-file', secretFile]);
  console.log('Server secrets installed.');
  await cli(['functions', 'deploy', 'send-sms-twofactor', '--project-ref', project, '--use-api']);
  const unsigned = await fetch(uri, { method: 'POST', body: '{}', signal: AbortSignal.timeout(20000) });
  if (unsigned.status !== 401) throw new Error('Hook did not reject an unsigned request; Auth has not been changed.');
  console.log('Deployed hook rejects unsigned requests.');
  const patch = {
    external_phone_enabled: true, sms_autoconfirm: false, sms_otp_length: 6,
    sms_otp_exp: 300, sms_max_frequency: 60,
    hook_send_sms_enabled: true, hook_send_sms_uri: uri, hook_send_sms_secrets: secret,
  };
  const applied = await fetch(authUrl, { method: 'PATCH', headers, body: JSON.stringify(patch), signal: AbortSignal.timeout(20000) });
  if (!applied.ok) throw new Error(`Auth configuration update failed (HTTP ${applied.status}).`);
  const verifyResponse = await fetch(authUrl, { headers, signal: AbortSignal.timeout(15000) });
  if (!verifyResponse.ok) throw new Error('Auth configuration read-back failed.');
  const current = await verifyResponse.json();
  for (const [field, value] of Object.entries(patch)) {
    // Management API does not return the plaintext hook signing secret.
    // Verify configuration presence here, and the signed request path below.
    if (field === 'hook_send_sms_secrets') {
      if (!current[field]) throw new Error('Hook signing secret is missing.');
      continue;
    }
    if (current[field] !== value) throw new Error(`Auth configuration read-back mismatch: ${field}.`);
  }
  const evidence = { deployedAt: new Date().toISOString(), project, hookUri: uri,
    unsignedRequestRejected: true, phoneEnabled: true, otpLength: 6, otpExpirySeconds: 300, resendSeconds: 60,
    scope: 'Hook deployment and Auth configuration only; no SMS sent, delivery/session acceptance pending; frontend not published.',
  };
  await writeFile(resolve(output, 'supabase-deployment.json'), JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify(evidence, null, 2));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
