import { describe, expect, it, vi } from 'vitest';
import { edgeHandler } from '../supabase/functions/cricket-mvp-worker/handler.mjs';

const token = 'ab'.repeat(32);
const request = (body = '', authorization = `Bearer ${token}`, method = 'POST') =>
  new Request('https://example.test/worker', { method, headers: { authorization }, ...(method === 'POST' ? { body } : {}) });

describe('scheduled MVP Edge Function', () => {
  it('denies anonymous, user JWT and wrong-token callers before database access', async () => {
    const client = vi.fn();
    const handler = edgeHandler({ token, client });
    for (const key of ['', 'Bearer user-jwt', `Bearer ${'00'.repeat(32)}`, 'sb_publishable_example', `Bearer ${'é'.repeat(64)}`]) {
      expect((await handler(request('', key))).status).toBe(401);
    }
    expect(client).not.toHaveBeenCalled();
  });
  it('fails closed for an absent deployment secret', async () => {
    const client = vi.fn();
    expect((await edgeHandler({ token: '', client })(request())).status).toBe(503);
    expect(client).not.toHaveBeenCalled();
  });
  it('rejects invalid modes, oversized bodies and non-POST methods', async () => {
    const client = vi.fn();
    const handler = edgeHandler({ token, client });
    expect((await handler(request('{"mode":"admin"}'))).status).toBe(400);
    expect((await handler(request('x'.repeat(257)))).status).toBe(400);
    expect((await handler(request('', `Bearer ${token}`, 'GET'))).status).toBe(405);
    expect(client).not.toHaveBeenCalled();
  });
  it('processes a bounded batch and records an idle heartbeat', async () => {
    const rpc = vi.fn(async (name: string) => ({ data: name === 'claim_cricket_mvp_work' ? [] : null, error: null }));
    const log = vi.fn();
    const response = await edgeHandler({ token, client: () => ({ rpc }), log })(request());
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith('claim_cricket_mvp_work', { p_limit: 2 });
    expect(rpc).toHaveBeenCalledWith('record_cricket_mvp_worker_heartbeat', { p_counts: { claimed: 0, completed: 0, superseded: 0, failed: 0 } });
    expect(await response.json()).toMatchObject({ claimed: 0, completed: 0, failed: 0 });
  });
  it('redacts backend errors in responses and logs', async () => {
    const errorLog = vi.fn();
    const response = await edgeHandler({ token, client: () => { throw new Error('private credential and player details'); }, errorLog })(request());
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain('private credential');
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain('private credential');
  });
});
