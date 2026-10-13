import { randomUUID } from 'node:crypto';

/** Local-only by design: test scripts never infer a target from .env.local. */
export function localEndpoint(value, port, label) {
  let url;
  try { url = new URL(value); } catch { throw new Error(`${label} must be an explicit local URL`); }
  if (url.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(url.hostname)
    || url.port !== String(port) || url.pathname !== '/' || url.username || url.password
    || url.search || url.hash) {
    throw new Error(`${label} must be http://127.0.0.1:${port} or http://localhost:${port}`);
  }
  return url.origin;
}

export function testEnvironment(env, { requireBackend = false } = {}) {
  const backendURL = localEndpoint(env.WRICKET_E2E_BACKEND_URL ?? 'http://127.0.0.1:54321', 54321, 'WRICKET_E2E_BACKEND_URL');
  const baseURL = localEndpoint(env.WRICKET_E2E_BASE_URL ?? 'http://127.0.0.1:4173', 4173, 'WRICKET_E2E_BASE_URL');
  const publishableKey = env.WRICKET_E2E_PUBLISHABLE_KEY;
  if (requireBackend && (!publishableKey || !publishableKey.startsWith('sb_publishable_'))) {
    throw new Error('WRICKET_E2E_PUBLISHABLE_KEY must be the local stack publishable key');
  }
  const runId = env.WRICKET_E2E_RUN_ID ?? randomUUID();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(runId)) {
    throw new Error('WRICKET_E2E_RUN_ID must be a UUID');
  }
  return { baseURL, backendURL, runId, publishableKey: publishableKey ?? 'sb_publishable_e2e_offline_smoke' };
}

export async function requireHealthyBackend(config) {
  let response;
  try {
    response = await fetch(`${config.backendURL}/auth/v1/health`, {
      headers: { apikey: config.publishableKey },
      redirect: 'error', signal: AbortSignal.timeout(5000),
    });
  } catch {
    throw new Error('Local Supabase is unavailable. Start the isolated stack before running backend tests.');
  }
  if (!response.ok) throw new Error(`Local Supabase health check failed (${response.status})`);
}
