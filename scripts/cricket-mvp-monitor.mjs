import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { queueHealth, serverClient } from './cricket-mvp-operations.mjs';

export async function monitor({ client, healthURL, maximumAgeSeconds = 120 }) {
  const report = await queueHealth(client, new Date(), maximumAgeSeconds);
  if (healthURL) {
    const url = new URL(healthURL);
    if (url.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(url.hostname)
      || url.pathname !== '/healthz' || url.username || url.password || url.search || url.hash) {
      throw new Error('The process health URL must be a local HTTP /healthz endpoint.');
    }
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(5000), redirect: 'error' });
      const data = await response.json();
      if (!response.ok || data.healthy !== true) throw new Error('Worker heartbeat unavailable');
    } catch {
      report.healthy = false;
      report.alerts.push('worker_heartbeat_unavailable');
    }
  }
  return report;
}

async function main() {
  const local = process.argv.includes('--local');
  if (!local && !process.argv.includes('--production')) throw new Error('Choose --local or --production explicitly.');
  if (local && process.argv.includes('--production')) throw new Error('Choose only one backend.');
  const client = local ? (await (await import('./e2e/backend-fixture.mjs')).localClients()).admin : serverClient(process.env);
  const report = await monitor({ client, healthURL: process.env.WRICKET_MVP_HEALTH_URL,
    maximumAgeSeconds: Number(process.env.WRICKET_MVP_MAX_QUEUE_AGE_SECONDS ?? 120) });
  console.log(JSON.stringify({ event: 'mvp_monitor', ...report }));
  if (!report.healthy) process.exitCode = 2;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await main(); } catch {
    console.error(JSON.stringify({ event: 'mvp_monitor', healthy: false, alerts: ['monitor_configuration_or_backend_failure'] }));
    process.exitCode = 2;
  }
}
