import type { PointEvent, Side } from './types';

export interface CloudScoringReplayEvent {
  readonly sequence: number;
  readonly clientEventId: string;
  readonly kind: string;
  readonly payload: Record<string, unknown>;
  readonly reversesClientEventId?: string;
  readonly createdAt: string;
}

/** Converts the append-only cloud log into the active point log used by the rules engine. */
export function activePointEvents(events: readonly CloudScoringReplayEvent[]): readonly PointEvent[] {
  const reversed = new Set(events
    .filter((event) => event.kind === 'UNDO' && event.reversesClientEventId)
    .map((event) => event.reversesClientEventId));
  return Object.freeze(events
    .filter((event) => event.kind === 'POINT' && !reversed.has(event.clientEventId))
    .sort((left, right) => left.sequence - right.sequence)
    .flatMap((event) => {
      const winner = event.payload.winner;
      if (winner !== 0 && winner !== 1) return [];
      const occurredAt = Date.parse(event.createdAt);
      return [{
        type: 'POINT' as const,
        sequence: event.sequence,
        winner: winner as Side,
        occurredAt: Number.isNaN(occurredAt) ? undefined : occurredAt,
      }];
    }));
}

export function lastActivePointEvent(
  events: readonly CloudScoringReplayEvent[],
): CloudScoringReplayEvent | undefined {
  const reversed = new Set(events
    .filter((event) => event.kind === 'UNDO' && event.reversesClientEventId)
    .map((event) => event.reversesClientEventId));
  return [...events]
    .sort((left, right) => right.sequence - left.sequence)
    .find((event) => event.kind === 'POINT' && !reversed.has(event.clientEventId));
}
