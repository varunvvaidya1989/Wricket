// Generated from the canonical server source; run npm run mvp:edge:build.
export async function queueHealth(client, now = new Date(), maximumAgeSeconds = 120) {
  if (!Number.isFinite(maximumAgeSeconds) || maximumAgeSeconds <= 0) throw new Error('Queue age threshold must be positive.');
  const count = async query => {
    const { count, error } = await query;
    if (error || !Number.isSafeInteger(count) || count < 0) throw new Error('MVP monitoring query failed; check server credentials, table grants and backend availability.');
    return count;
  };
  const table = () => client.from('match_mvp_calculations');
  const select = () => table().select('match_id', { count: 'exact', head: true });
  const results = await Promise.all([
    count(select().eq('status', 'PENDING')),
    count(select().eq('status', 'CALCULATING')),
    count(select().eq('status', 'FAILED')),
    count(select().eq('status', 'FAILED').gte('attempts', 3)),
    count(select().eq('status', 'CALCULATING').lt('updated_at', new Date(now.getTime() - 300000).toISOString())),
    table().select('requested_at').in('status', ['PENDING', 'CALCULATING', 'FAILED'])
      .order('requested_at', { ascending: true }).limit(1),
  ]);
  const [pending, processing, failed, exhausted, expiredLeases, oldest] = results;
  if (oldest.error) throw new Error('MVP queue age query failed; check server permissions and backend availability.');
  const requestedAt = oldest.data?.[0]?.requested_at;
  const oldestAgeSeconds = requestedAt ? Math.max(0, (now.getTime() - Date.parse(requestedAt)) / 1000) : 0;
  if (!Number.isFinite(oldestAgeSeconds)) throw new Error('MVP queue returned an invalid timestamp.');
  const alerts = [];
  if (oldestAgeSeconds > maximumAgeSeconds) alerts.push('overdue_queue');
  if (expiredLeases) alerts.push('expired_leases');
  if (exhausted) alerts.push('exhausted_retries');
  return { at: now.toISOString(), healthy: alerts.length === 0, pending, processing, failed,
    exhausted, expiredLeases, oldestAgeSeconds: Math.round(oldestAgeSeconds), alerts };
}
