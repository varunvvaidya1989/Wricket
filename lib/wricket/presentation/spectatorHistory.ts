import type { CloudMatchEvent } from '@/lib/supabase/liveMatchApi';

// Keep correction notices in the timeline, but exclude their reversed balls
// from both commentary and every scorecard/insight derived from that history.
export function spectatorHistory(events: readonly CloudMatchEvent[]): CloudMatchEvent[] {
  const reversed = new Set(events.filter(event => event.kind === 'BALL_CORRECTED')
    .map(event => event.payload.target_client_event_id)
    .filter((value): value is string => typeof value === 'string'));
  return events.filter(event => event.kind !== 'BALL_RECORDED' || !reversed.has(event.clientEventId ?? event.id))
    .sort((a, b) => b.sequence - a.sequence);
}
