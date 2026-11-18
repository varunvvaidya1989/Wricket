import { randomBytes } from 'node:crypto';
import { Webhook } from 'standardwebhooks';
import { describe, expect, it, vi } from 'vitest';
import { createSmsHook } from '../../supabase/functions/send-sms-twofactor/handler.mjs';

const secret = `whsec_${randomBytes(32).toString('base64')}`;
const webhook = new Webhook(secret);
const payload = { user: { id: 'test-account', phone: '+919876543210' }, sms: { otp: '123456' } };
function signed(body: unknown = payload, date = new Date()) {
  const raw = JSON.stringify(body); const id = 'msg_test';
  return new Request('https://example.invalid/hook', { method: 'POST', body: raw, headers: {
    'webhook-id': id, 'webhook-timestamp': String(Math.floor(date.getTime() / 1000)), 'webhook-signature': webhook.sign(id, date, raw),
  } });
}
function fixture(status = 200, data: unknown = { Status: 'Success', Details: 'opaque-session' }) {
  const fetcher = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () => new Response(JSON.stringify(data), { status }));
  const handler = createSmsHook({ verify: (raw, headers) => webhook.verify(raw, headers), apiKey: 'server-only-key', template: 'SportStage Login', fetcher });
  return { handler, fetcher };
}
describe('signed 2Factor Supabase SMS hook', () => {
  it('sends exactly the Supabase code with the approved OTP template', async () => {
    const f = fixture(); const response = await f.handler(signed());
    expect(response.status).toBe(200); expect(await response.json()).toEqual({});
    expect(f.fetcher).toHaveBeenCalledTimes(1);
    const url = new URL(String(f.fetcher.mock.calls[0][0]));
    expect(url.hostname).toBe('2factor.in');
    expect(decodeURIComponent(url.pathname)).toBe('/API/V1/server-only-key/SMS/+919876543210/123456/SportStage Login');
    expect(f.fetcher.mock.calls[0][1]?.redirect).toBe('error');
  });
  it('accepts Auth phone values without a leading plus', async () => {
    const f = fixture(); expect((await f.handler(signed({ ...payload, user: { phone: '919876543210' } }))).status).toBe(200);
  });
  it('denies missing, tampered and expired signatures before any provider request', async () => {
    const f = fixture();
    expect((await f.handler(new Request('https://example.invalid', { method: 'POST', body: JSON.stringify(payload) }))).status).toBe(401);
    const original = signed(); const tampered = new Request(original.url, { method: 'POST', headers: original.headers, body: JSON.stringify({ ...payload, sms: { otp: '654321' } }) });
    expect((await f.handler(tampered)).status).toBe(401);
    expect((await f.handler(signed(payload, new Date(Date.now() - 600000)))).status).toBe(401);
    expect(f.fetcher).not.toHaveBeenCalled();
  });
  it.each([{ user: { phone: '+14155552671' }, sms: { otp: '123456' } }, { ...payload, sms: { otp: '1234' } }, {}, { ...payload, sms: { otp: 123456 } }])('rejects unsupported signed payload %j', async body => {
    const f = fixture(); expect((await f.handler(signed(body))).status).toBe(400); expect(f.fetcher).not.toHaveBeenCalled();
  });
  it('fails closed when unconfigured and rejects non-POST/oversized input', async () => {
    expect((await createSmsHook({ verify: null })(signed())).status).toBe(503);
    const f = fixture(); expect((await f.handler(new Request('https://example.invalid'))).status).toBe(405);
    expect((await f.handler(signed({ value: 'x'.repeat(17000) }))).status).toBe(413);
    expect(f.fetcher).not.toHaveBeenCalled();
  });
  it('never leaks provider errors, phone, code or key and does not retry', async () => {
    const f = fixture(200, { Status: 'Error', Details: 'sensitive provider data' });
    const response = await f.handler(signed()); expect(response.status).toBe(502);
    expect(await response.text()).not.toMatch(/sensitive|123456|9876543210|server-only-key/);
    expect(f.fetcher).toHaveBeenCalledTimes(1);
    f.fetcher.mockRejectedValueOnce(new Error('secret URL'));
    expect(await (await f.handler(signed())).text()).not.toContain('secret URL');
    expect(f.fetcher).toHaveBeenCalledTimes(2);
  });
});
