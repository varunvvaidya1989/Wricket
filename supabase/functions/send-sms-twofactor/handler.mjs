const MAX_BODY_BYTES = 16384;

function reply(status, message) {
  return new Response(JSON.stringify(message ? { error: { http_code: status, message } } : {}), {
    status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

/** Server-only Supabase SMS hook. verify must authenticate the raw body. */
export function createSmsHook({ verify, apiKey, template, fetcher = fetch }) {
  return async request => {
    if (request.method !== 'POST') return reply(405, 'POST required.');
    if (!apiKey || !template || !verify) return reply(503, 'SMS delivery is not configured.');
    if (Number(request.headers.get('content-length')) > MAX_BODY_BYTES) return reply(413, 'Request too large.');
    let payload;
    try {
      const raw = await request.text();
      if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) return reply(413, 'Request too large.');
      payload = await verify(raw, Object.fromEntries(request.headers));
    } catch { return reply(401, 'Invalid webhook signature.'); }
    const phone = payload?.user?.phone;
    const code = payload?.sms?.otp;
    // Only the Indian mobile route tested for this account is enabled.
    // The signed Auth payload supplies both values, never client metadata.
    const normalizedPhone = typeof phone === 'string' ? `+${phone.replace(/^\+/, '')}` : '';
    if (!/^\+91[6-9]\d{9}$/.test(normalizedPhone) || typeof code !== 'string' || !/^\d{6}$/.test(code)) {
      return reply(400, 'A supported Indian phone number and six-digit code are required.');
    }
    try {
      // Supabase owns OTP generation/verification. AUTOGEN would send the wrong code.
      // The provider embeds credentials and OTPs in the URL: never log it or errors.
      const url = `https://2factor.in/API/V1/${encodeURIComponent(apiKey)}/SMS/${encodeURIComponent(normalizedPhone)}/${code}/${encodeURIComponent(template)}`;
      const result = await fetcher(url, { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(4000) });
      const data = await result.json();
      if (!result.ok || data?.Status !== 'Success') return reply(502, 'SMS provider did not accept the request.');
      return reply(200);
    } catch {
      // No automatic retry: a timeout can occur after an SMS was accepted.
      return reply(502, 'SMS delivery could not be confirmed. Please wait before retrying.');
    }
  };
}
