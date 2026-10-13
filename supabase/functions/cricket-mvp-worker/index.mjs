import { createClient } from 'npm:@supabase/supabase-js@2.109.0';
import { edgeHandler } from './handler.mjs';

const deno = globalThis.Deno;
deno.serve(edgeHandler({
  token: deno.env.get('WRICKET_MVP_CRON_TOKEN'),
  client() {
    const url = deno.env.get('SUPABASE_URL');
    if (url !== 'https://lzgnuqwvsioinwwrsdvn.supabase.co') throw new Error('Wrong worker project');
    const secrets = JSON.parse(deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}');
    const key = secrets.default ?? deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!key) throw new Error('Server key unavailable');
    return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: (input, init) => fetch(input, { ...init, redirect: 'error', signal: AbortSignal.timeout(15000) }) },
    });
  },
}));
