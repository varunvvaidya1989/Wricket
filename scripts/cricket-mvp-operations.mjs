import { createClient } from '@supabase/supabase-js';
import { createServer } from 'node:http';

export function serverConfig(env) {
  const ref = env.WRICKET_SUPABASE_PROJECT_REF?.trim();
  if (!ref || !/^[a-z]{20}$/.test(ref)) throw new Error('Set WRICKET_SUPABASE_PROJECT_REF to the authorised project reference.');
  const url = env.SUPABASE_URL?.trim();
  if (url !== `https://${ref}.supabase.co`) throw new Error('SUPABASE_URL does not match WRICKET_SUPABASE_PROJECT_REF.');
  const key = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!key) throw new Error('A server-only SUPABASE_SERVICE_ROLE_KEY is required.');
  if (!key.startsWith('sb_secret_')) {
    let role;
    try { role = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role; } catch { /* rejected below */ }
    if (role !== 'service_role') throw new Error('The worker requires a secret API key or service-role JWT, not a client key.');
  }
  return { ref, url, key };
}

export function serverClient(env) {
  const { url, key } = serverConfig(env);
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => fetch(input, {
      ...init, redirect: 'error', signal: init?.signal
        ? AbortSignal.any([init.signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000),
    }) },
  });
}

export { queueHealth } from './cricket-mvp-queue-health.mjs';

// The HTTP response contains aggregate process state only, never snapshots or errors.
export function startWorkerHealth({ port = 8088, host = '127.0.0.1', now = Date.now } = {}) {
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid worker health port.');
  const state = { startedAt: now(), lastSuccess: null, claimed: 0, completed: 0, superseded: 0, failed: 0 };
  const server = createServer((request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Content-Type', 'application/json');
    if (request.url !== '/healthz' || request.method !== 'GET') {
      response.writeHead(404); response.end('{}'); return;
    }
    const healthy = state.lastSuccess !== null && now() - state.lastSuccess < 60000;
    response.writeHead(healthy ? 200 : 503);
    response.end(JSON.stringify({ healthy, ...state }));
  });
  // Bind errors must fail startup so a supervisor can detect the failed worker.
  const ready = new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => { server.removeListener('error', reject); resolve(server.address()); });
  });
  return { ready, record(totals) {
    state.lastSuccess = now();
    for (const key of ['claimed', 'completed', 'superseded', 'failed']) state[key] += totals[key];
  }, close: () => new Promise(resolve => server.close(resolve)) };
}
