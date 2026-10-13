import { afterEach, describe, expect, it } from 'vitest';
import { queueHealth, serverConfig, startWorkerHealth } from './cricket-mvp-operations.mjs';
import { monitor } from './cricket-mvp-monitor.mjs';

const ref = 'lzgnuqwvsioinwwrsdvn';
const config = { WRICKET_SUPABASE_PROJECT_REF: ref, SUPABASE_URL: `https://${ref}.supabase.co`, SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_test_server_key' };
function queue(rows: { status: string; requested_at: string; updated_at: string; attempts: number }[], denied = false) {
  return { from() {
    const filters: ((row: typeof rows[number]) => boolean)[] = [];
    let head = false;
    let limit = Infinity;
    const access = (row: typeof rows[number], column: string) => row[column as keyof typeof row];
    const query = {
      select(_column: string, options?: { head: boolean }) { head = !!options?.head; return query; },
      eq(column: string, value: unknown) { filters.push(row => access(row, column) === value); return query; },
      gte(column: string, value: number) { filters.push(row => Number(access(row, column)) >= value); return query; },
      lt(column: string, value: string) { filters.push(row => String(access(row, column)) < value); return query; },
      in(column: string, values: string[]) { filters.push(row => values.includes(String(access(row, column)))); return query; },
      order() { return query; },
      limit(value: number) { limit = value; return query; },
      then(resolve: (value: unknown) => unknown) {
        const matches = rows.filter(row => filters.every(filter => filter(row))).sort((a, b) => a.requested_at.localeCompare(b.requested_at));
        return Promise.resolve(resolve(denied ? { error: { message: 'private backend details' } }
          : { error: null, count: head ? matches.length : null, data: head ? null : matches.slice(0, limit) }));
      },
    };
    return query;
  } };
}

let health: ReturnType<typeof startWorkerHealth> | undefined;
afterEach(async () => { await health?.close(); health = undefined; });

describe('server worker targeting and operational health', () => {
  it('refuses another project and public keys before sending requests', () => {
    expect(serverConfig(config).ref).toBe(ref);
    expect(() => serverConfig({ ...config, SUPABASE_URL: 'https://hmqldsjqrcomqxknxrws.supabase.co' })).toThrow('does not match');
    expect(() => serverConfig({ ...config, SUPABASE_SERVICE_ROLE_KEY: 'sb_publishable_client' })).toThrow('not a client key');
    const jwt = `header.${Buffer.from(JSON.stringify({ role: 'anon' })).toString('base64url')}.signature`;
    expect(() => serverConfig({ ...config, SUPABASE_SERVICE_ROLE_KEY: jwt })).toThrow('not a client key');
    expect(() => serverConfig({ ...config, WRICKET_SUPABASE_PROJECT_REF: undefined })).toThrow('project reference');
  });
  it('reports a healthy empty queue and counts beyond the API row cap', async () => {
    expect((await queueHealth(queue([]))).healthy).toBe(true);
    const date = new Date('2026-10-11T12:00:00Z');
    const row = { status: 'PENDING', requested_at: date.toISOString(), updated_at: date.toISOString(), attempts: 0 };
    expect((await queueHealth(queue(Array.from({ length: 2016 }, () => row)), date)).pending).toBe(2016);
  });
  it('flags overdue work, expired leases and exhausted retries without leaking row data', async () => {
    const date = new Date('2026-10-11T12:00:00Z');
    const old = '2026-10-11T11:54:00Z';
    const report = await queueHealth(queue([
      { status: 'PENDING', requested_at: old, updated_at: old, attempts: 0 },
      { status: 'CALCULATING', requested_at: old, updated_at: old, attempts: 1 },
      { status: 'FAILED', requested_at: old, updated_at: old, attempts: 3 },
    ]), date);
    expect(report.healthy).toBe(false);
    expect(report.alerts).toEqual(['overdue_queue', 'expired_leases', 'exhausted_retries']);
    expect(report.oldestAgeSeconds).toBe(360);
    expect(report.exhausted).toBe(1);
    expect(JSON.stringify(report)).not.toContain('requested_at');
  });
  it('never converts a failed query into a healthy empty queue', async () => {
    await expect(queueHealth(queue([], true))).rejects.toThrow('monitoring query failed');
    await expect(queueHealth(queue([]), new Date(), NaN)).rejects.toThrow('threshold');
  });
  it('detects startup, healthy polling and stalled heartbeat through the HTTP endpoint', async () => {
    let clock = 100000;
    health = startWorkerHealth({ port: 0, now: () => clock });
    const address = await health.ready;
    const url = `http://127.0.0.1:${address.port}/healthz`;
    expect((await fetch(url)).status).toBe(503);
    health.record({ claimed: 2, completed: 1, superseded: 1, failed: 0 });
    expect((await monitor({ client: queue([]), healthURL: url })).healthy).toBe(true);
    clock += 61000;
    const result = await monitor({ client: queue([]), healthURL: url });
    expect(result.alerts).toContain('worker_heartbeat_unavailable');
    expect(result.healthy).toBe(false);
  });
  it('rejects remote heartbeat URLs and detects a stopped worker', async () => {
    await expect(monitor({ client: queue([]), healthURL: 'https://example.com/healthz' })).rejects.toThrow('local HTTP');
    health = startWorkerHealth({ port: 0 });
    const address = await health.ready;
    await health.close(); health = undefined;
    const result = await monitor({ client: queue([]), healthURL: `http://127.0.0.1:${address.port}/healthz` });
    expect(result.alerts).toContain('worker_heartbeat_unavailable');
  });
});
