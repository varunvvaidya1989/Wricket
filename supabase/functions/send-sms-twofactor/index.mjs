// Deno resolves npm specifiers in the deployed Edge runtime.
// eslint-disable-next-line import/no-unresolved
import { Webhook } from 'npm:standardwebhooks@1.0.0';
import { createSmsHook } from './handler.mjs';

const deno = globalThis.Deno;
const secret = deno.env.get('SEND_SMS_HOOK_SECRET')?.replace(/^v1,/, '');
const webhook = secret ? new Webhook(secret) : null;
deno.serve(createSmsHook({
  verify: webhook ? (raw, headers) => webhook.verify(raw, headers) : null,
  apiKey: deno.env.get('TWOFACTOR_API_KEY'),
  template: deno.env.get('TWOFACTOR_OTP_TEMPLATE'),
}));
