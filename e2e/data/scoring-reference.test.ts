import { describe, expect, it } from 'vitest';
import { createInitialInningsState, rebuildInningsState, scorecardForEvents } from '@/lib/wricket/domain/scoring/index';
import type { ScoringEvent } from '@/lib/wricket/domain/scoring/index';
import { referenceEvents, referenceExpected, referenceOpening, referenceRules } from './scoring-reference';
import { applyBall, type BallEvent, type InningsState } from '@/lib/wricket/domain/scoring';
import { deriveScoringStateFromHistory } from '@/lib/wricket/app/scoring-session';
import type { Ball } from '@/lib/wricket/domain/types';

const initial = createInitialInningsState(referenceOpening);

describe('revamp reviewed scoring reference', () => {
  it('agrees with the existing route command and saved-ball restoration path', () => {
    let state: InningsState = { totalRuns: 0, totalWickets: 0, legalBalls: 0, overNo: 0, legalBallInOver: 0, strikerId: 'batter-a', nonStrikerId: 'batter-b', bowlerId: 'bowler-a' };
    const commands: BallEvent[] = [
      { runs: 1, extra: null, isWicket: false }, { runs: 4, extra: null, isWicket: false },
      { runs: 0, extra: null, isWicket: false }, { runs: 0, extra: 'WIDE', isWicket: false },
      { runs: 0, extra: 'NO_BALL', isWicket: false }, { runs: 2, extra: 'BYE', isWicket: false },
    ];
    const balls: Ball[] = commands.map((command, index) => {
      const applied = applyBall(state, command);
      state = applied.next;
      return { ...applied.ball, id: `reference-ball-${index}`, inningsId: initial.inningsId, createdAt: index + 1 };
    });
    expect(state).toMatchObject({ totalRuns: 9, totalWickets: 0, legalBalls: 4, strikerId: 'batter-b', nonStrikerId: 'batter-a' });
    const restored = deriveScoringStateFromHistory(balls, [{ id: 'adjustment-1', inningsId: initial.inningsId, kind: 'PENALTY', runs: 5, createdAt: 7 }]);
    expect(restored).toMatchObject({ totalRuns: 14, totalWickets: 0, legalBalls: 4, strikerId: 'batter-b', nonStrikerId: 'batter-a', lastCommittedEventSequence: 7 });
  });

  it('preserves the independent ledger across replay, scorecard and last-event removal', () => {
    const card = scorecardForEvents(initial, referenceEvents, referenceRules);
    expect(card.innings).toMatchObject({ totalRuns: 14, totalWickets: 0, legalBalls: 4, oversText: '0.4' });
    expect(card.extras).toEqual(referenceExpected.extras);
    expect(card.batters.map(b => b.runs)).toEqual(referenceExpected.batterRuns);
    expect(card.bowlers[0]).toMatchObject({ runsConceded: 7, legalBalls: 4, wickets: 0 });
    const withoutAdjustment = scorecardForEvents(initial, referenceEvents.slice(0, -1), referenceRules);
    expect(withoutAdjustment.innings.totalRuns).toBe(9);
    expect(withoutAdjustment.batters).toEqual(card.batters);
    expect(withoutAdjustment.bowlers).toEqual(card.bowlers);
    const replay = rebuildInningsState(initial, JSON.parse(JSON.stringify(referenceEvents)), referenceRules);
    expect(replay.ok).toBe(true);
    if (replay.ok) expect(replay.value.state).toMatchObject({ strikerId: 'batter-b', nonStrikerId: 'batter-a', totalRuns: 14, legalBalls: 4 });
  });

  it.each(['RETIRED_HURT', 'RETIRED_OUT'] as const)('retirement %s retains balls and bowler attribution', kind => {
    const retirement: ScoringEvent = { type: 'RETIREMENT', sequence: 8, inningsId: initial.inningsId, playerId: 'batter-b', kind };
    const events = [...referenceEvents, retirement];
    const card = scorecardForEvents(initial, events, referenceRules);
    expect(card.innings).toMatchObject({ totalRuns: 14, totalWickets: kind === 'RETIRED_OUT' ? 1 : 0, legalBalls: 4 });
    expect(card.bowlers[0]).toMatchObject({ wickets: 0, legalBalls: 4, runsConceded: 7 });
    const replay = rebuildInningsState(initial, events, referenceRules);
    expect(replay.ok).toBe(true);
    if (replay.ok) {
      expect(replay.value.state.strikerId).toBeUndefined();
      expect(replay.value.effectsByEvent.at(-1)).toEqual([{ type: 'SELECT_NEXT_BATTER', replacingPlayerId: 'batter-b' }]);
    }
    expect(scorecardForEvents(initial, events.slice(0, -1), referenceRules).innings.totalWickets).toBe(0);
  });

  it('closes a chase reached by an adjustment without adding a delivery', () => {
    const replay = rebuildInningsState(initial, referenceEvents, { ...referenceRules, targetRuns: 12 });
    expect(replay.ok).toBe(true);
    if (replay.ok) expect(replay.value.state).toMatchObject({ totalRuns: 14, legalBalls: 4, isClosed: true, closureReason: 'TARGET_REACHED' });
  });
});
