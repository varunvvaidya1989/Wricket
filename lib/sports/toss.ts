export type CoinSide = 'HEADS' | 'TAILS';

export interface CoinTossParticipant {
  id: string;
  name: string;
}

export interface CoinTossRequest {
  participants: readonly [CoinTossParticipant, CoinTossParticipant];
  callerId: string;
  calledSide: CoinSide;
}

export interface CoinTossResult {
  callerId: string;
  calledSide: CoinSide;
  landedSide: CoinSide;
  winnerId: string;
  loserId: string;
  flippedAt: string;
}

/**
 * Generic two-participant coin toss. The random source is injectable so the
 * domain behavior is deterministic in tests and reusable by every sport.
 */
export function flipCoin(
  request: CoinTossRequest,
  random: () => number = Math.random,
  now: () => Date = () => new Date(),
): CoinTossResult {
  const ids = request.participants.map(participant => participant.id);
  if (new Set(ids).size !== 2 || ids.some(id => !id)) {
    throw new Error('A coin toss requires two distinct participants');
  }
  if (!ids.includes(request.callerId)) {
    throw new Error('The caller must be one of the toss participants');
  }
  const sample = random();
  if (!Number.isFinite(sample) || sample < 0 || sample >= 1) {
    throw new Error('The random source must return a value from 0 up to 1');
  }
  const landedSide: CoinSide = sample < 0.5 ? 'HEADS' : 'TAILS';
  const otherId = ids.find(id => id !== request.callerId)!;
  const winnerId = landedSide === request.calledSide ? request.callerId : otherId;
  return {
    callerId: request.callerId,
    calledSide: request.calledSide,
    landedSide,
    winnerId,
    loserId: winnerId === request.callerId ? otherId : request.callerId,
    flippedAt: now().toISOString(),
  };
}
