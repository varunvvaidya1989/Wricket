type HistoryEvent = {
  client_event_id: string;
  kind: string;
  payload: Record<string, unknown> | null;
};

// The cloud log is append-only. A correction reverses a delivery rather than
// deleting it; the local cache must contain only effective deliveries.
export function effectiveScoringEvents<T extends HistoryEvent>(events: readonly T[]): T[] {
  const corrected = new Set(events.filter(event => event.kind === 'BALL_CORRECTED')
    .map(event => event.payload?.target_client_event_id)
    .filter((id): id is string => typeof id === 'string'));
  return events.filter(event => event.kind !== 'BALL_CORRECTED'
    && !(event.kind === 'BALL_RECORDED' && corrected.has(event.client_event_id)));
}
