import { timingSafeEqual } from 'node:crypto';
import { calculateMatchMvp } from '../_shared/cricket-mvp-generated/mvp/calculator.mjs';
import { cloudMvpInput } from '../_shared/cricket-mvp-generated/mvp/cloud-input.mjs';
import { processMvpBatch } from '../_shared/cricket-mvp-generated/cricket-mvp-batch.mjs';
import { queueHealth } from '../_shared/cricket-mvp-generated/cricket-mvp-queue-health.mjs';

export function edgeHandler({ token, client, log = console.log, errorLog = console.error }) {
  return async request => {
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return Response.json({ error: 'Worker configuration unavailable' }, { status: 503 });
    const provided = request.headers.get('authorization') ?? '';
    const expected = `Bearer ${token}`;
    if (!/^Bearer [a-f0-9]{64}$/.test(provided) || !timingSafeEqual(new TextEncoder().encode(provided), new TextEncoder().encode(expected))) {
      return Response.json({ error: 'Unauthorised' }, { status: 401 });
    }
    if (request.method !== 'POST') return Response.json({ error: 'POST required' }, { status: 405 });
    let mode = 'worker';
    try {
      const body = await request.text();
      if (body.length > 256) return Response.json({ error: 'Invalid request' }, { status: 400 });
      if (body) mode = JSON.parse(body).mode ?? 'worker';
    } catch { return Response.json({ error: 'Invalid request' }, { status: 400 }); }
    if (!['worker', 'monitor'].includes(mode)) return Response.json({ error: 'Invalid mode' }, { status: 400 });
    try {
      const admin = client();
      if (mode === 'monitor') {
        const report = { event: 'mvp_monitor', ...await queueHealth(admin) };
        const { data: heartbeat, error } = await admin.rpc('get_cricket_mvp_worker_heartbeat');
        if (error) throw new Error('Worker heartbeat unavailable');
        if (!heartbeat?.lastSuccess || !Number.isFinite(Number(heartbeat.ageSeconds)) || Number(heartbeat.ageSeconds) > 90) {
          report.healthy = false;
          report.alerts.push('worker_heartbeat_overdue');
        }
        (report.healthy ? log : errorLog)(JSON.stringify(report));
        return Response.json(report, { status: report.healthy ? 200 : 503 });
      }
      // One small batch fits the Edge CPU budget; SQL leases allow overlapping calls safely.
      const totals = await processMvpBatch(admin, { calculateMatchMvp, cloudMvpInput }, 2);
      const { error } = await admin.rpc('record_cricket_mvp_worker_heartbeat', { p_counts: totals });
      if (error) throw new Error('Could not record worker heartbeat');
      const report = { event: 'mvp_batch', at: new Date().toISOString(), ...totals };
      (totals.failed ? errorLog : log)(JSON.stringify(report));
      return Response.json(report, { status: totals.failed ? 503 : 200 });
    } catch {
      const report = { event: 'mvp_backend_unavailable', healthy: false, at: new Date().toISOString() };
      errorLog(JSON.stringify(report));
      return Response.json(report, { status: 503 });
    }
  };
}
