import { Ball } from './types';

export interface BatsmanLine {
  userId: string;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  isOut: boolean;
  dismissalText?: string;
  strikeRate: number;
}

export interface BowlerLine {
  userId: string;
  legalBalls: number;
  runsConceded: number;
  wickets: number;
  wides: number;
  noBalls: number;
  economy: number;
  oversText: string;
}

export function batsmanLineFor(
  userId: string,
  balls: Ball[],
): BatsmanLine {
  let runs = 0,
    facedBalls = 0,
    fours = 0,
    sixes = 0;
  let isOut = false;
  let dismissalText: string | undefined;

  for (const b of balls) {
    if (b.strikerId === userId) {
      // Faced ball counts unless it's a wide (didn't actually face it)
      if (b.extraKind !== 'WIDE') facedBalls += 1;
      runs += b.runsBat;
      if (b.runsBat === 4) fours += 1;
      if (b.runsBat === 6) sixes += 1;
    }
    if (b.isWicket && b.dismissal?.outPlayerId === userId) {
      isOut = true;
      dismissalText = describeDismissal(b);
    }
  }

  return {
    userId,
    runs,
    balls: facedBalls,
    fours,
    sixes,
    isOut,
    dismissalText,
    strikeRate: facedBalls === 0 ? 0 : (runs / facedBalls) * 100,
  };
}

export function bowlerLineFor(userId: string, balls: Ball[]): BowlerLine {
  let legalBalls = 0,
    runsConceded = 0,
    wickets = 0,
    wides = 0,
    noBalls = 0;

  for (const b of balls) {
    if (b.bowlerId !== userId) continue;
    if (b.isLegal) legalBalls += 1;
    // Runs charged to bowler: bat runs, wides, no-balls. Byes and leg-byes are NOT charged.
    if (b.extraKind === 'BYE' || b.extraKind === 'LEG_BYE') {
      runsConceded += b.runsBat; // no-ball + bye edge case; if extra=BYE, runsBat is 0 anyway
    } else {
      runsConceded += b.runsBat + b.runsExtra;
    }
    if (b.extraKind === 'WIDE') wides += 1;
    if (b.extraKind === 'NO_BALL') noBalls += 1;
    if (
      b.isWicket &&
      b.dismissal &&
      ['BOWLED', 'CAUGHT', 'LBW', 'STUMPED', 'HIT_WICKET'].includes(b.dismissal.kind)
    ) {
      wickets += 1;
    }
  }

  const overs = Math.floor(legalBalls / 6);
  const rem = legalBalls % 6;
  return {
    userId,
    legalBalls,
    runsConceded,
    wickets,
    wides,
    noBalls,
    economy: legalBalls === 0 ? 0 : (runsConceded / legalBalls) * 6,
    oversText: `${overs}.${rem}`,
  };
}

export function describeDismissal(b: Ball): string {
  if (!b.dismissal) return '';
  switch (b.dismissal.kind) {
    case 'BOWLED':
      return `b ${shortId(b.bowlerId)}`;
    case 'CAUGHT':
      return `c ${shortId(b.dismissal.fielderId ?? '')} b ${shortId(b.bowlerId)}`;
    case 'LBW':
      return `lbw b ${shortId(b.bowlerId)}`;
    case 'RUN_OUT':
      return `run out (${shortId(b.dismissal.fielderId ?? '')})`;
    case 'STUMPED':
      return `st ${shortId(b.dismissal.fielderId ?? '')} b ${shortId(b.bowlerId)}`;
    case 'HIT_WICKET':
      return `hit wicket b ${shortId(b.bowlerId)}`;
    case 'RETIRED_OUT':
      return 'retired out';
  }
}

function shortId(id: string): string {
  return id ? id.slice(0, 4) : '';
}

export function ballSymbol(b: Ball): string {
  if (b.isWicket) return 'W';
  if (b.extraKind === 'WIDE') return `${b.runsExtra}wd`;
  if (b.extraKind === 'NO_BALL') return `${b.runsBat + b.runsExtra}nb`;
  if (b.extraKind === 'BYE') return `${b.runsExtra}b`;
  if (b.extraKind === 'LEG_BYE') return `${b.runsExtra}lb`;
  const r = b.runsBat;
  if (r === 0) return '•';
  return String(r);
}
