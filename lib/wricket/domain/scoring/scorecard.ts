import type { DeliveryEvent, InningsState, ScoringEvent, ScoringRules } from './events';
import { isLegalDelivery } from './events';
import { overProgressFor } from './completion';
import { rebuildInningsState } from './replay';

export interface CanonicalBatterLine {
  readonly userId: string;
  readonly runs: number;
  readonly balls: number;
  readonly fours: number;
  readonly sixes: number;
  readonly isOut: boolean;
  readonly dismissalText?: string;
  readonly strikeRate: number;
}

export interface CanonicalBowlerLine {
  readonly userId: string;
  readonly legalBalls: number;
  readonly runsConceded: number;
  readonly wickets: number;
  readonly wides: number;
  readonly noBalls: number;
  readonly economy: number;
  readonly oversText: string;
}

export interface ExtrasBreakdown {
  readonly byes: number;
  readonly legByes: number;
  readonly wides: number;
  readonly noBalls: number;
  readonly penalties: number;
  readonly bonuses: number;
  readonly total: number;
}

type MutableExtrasBreakdown = {
  -readonly [Key in keyof ExtrasBreakdown]: ExtrasBreakdown[Key];
};

export interface CanonicalScorecard {
  readonly innings: {
    readonly totalRuns: number;
    readonly totalWickets: number;
    readonly legalBalls: number;
    readonly oversText: string;
    readonly isClosed: boolean;
    readonly closureReason?: InningsState['closureReason'];
  };
  readonly batters: readonly CanonicalBatterLine[];
  readonly bowlers: readonly CanonicalBowlerLine[];
  readonly extras: ExtrasBreakdown;
}

interface MutableBatterLine {
  userId: string;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  isOut: boolean;
  dismissalText?: string;
}

interface MutableBowlerLine {
  userId: string;
  legalBalls: number;
  runsConceded: number;
  wickets: number;
  wides: number;
  noBalls: number;
}

export function scorecardForEvents(
  initialState: InningsState,
  events: readonly ScoringEvent[],
  rules: ScoringRules,
  playerName: (playerId: string) => string = shortId,
): CanonicalScorecard {
  const replay = rebuildInningsState(initialState, events, rules);
  if (!replay.ok) {
    throw new Error(`${replay.error.code} at event ${replay.eventIndex}`);
  }

  const batters = new Map<string, MutableBatterLine>();
  const bowlers = new Map<string, MutableBowlerLine>();
  const extras: MutableExtrasBreakdown = {
    byes: 0,
    legByes: 0,
    wides: 0,
    noBalls: 0,
    penalties: 0,
    bonuses: 0,
    total: 0,
  };

  for (const event of events) {
    if (event.type === 'DELIVERY') {
      applyDeliveryToScorecard(event, batters, bowlers, extras, playerName);
    }
    if (event.type === 'ADJUSTMENT') {
      if (event.kind === 'PENALTY') extras.penalties += event.runs;
      if (event.kind === 'BONUS') extras.bonuses += event.runs;
      extras.total += event.runs;
    }
    if (event.type === 'RETIREMENT') {
      const batter = ensureBatter(batters, event.playerId);
      if (event.kind === 'RETIRED_OUT') {
        batter.isOut = true;
        batter.dismissalText = 'retired out';
      } else {
        batter.dismissalText = 'retired hurt';
      }
    }
  }

  return {
    innings: {
      totalRuns: replay.value.state.totalRuns,
      totalWickets: replay.value.state.totalWickets,
      legalBalls: replay.value.state.legalBalls,
      oversText: oversTextFor(replay.value.state.legalBalls, rules.ballsPerOver),
      isClosed: replay.value.state.isClosed,
      closureReason: replay.value.state.closureReason,
    },
    batters: [...batters.values()].map(finalizeBatterLine),
    bowlers: [...bowlers.values()].map(bowler => finalizeBowlerLine(bowler, rules.ballsPerOver)),
    extras,
  };
}

export function batterLineForEvents(
  userId: string,
  events: readonly ScoringEvent[],
  initialState: InningsState,
  rules: ScoringRules,
): CanonicalBatterLine {
  return (
    scorecardForEvents(initialState, events, rules).batters.find(line => line.userId === userId) ??
    finalizeBatterLine(ensureBatter(new Map(), userId))
  );
}

export function bowlerLineForEvents(
  userId: string,
  events: readonly ScoringEvent[],
  initialState: InningsState,
  rules: ScoringRules,
): CanonicalBowlerLine {
  return (
    scorecardForEvents(initialState, events, rules).bowlers.find(line => line.userId === userId) ??
    finalizeBowlerLine(ensureBowler(new Map(), userId), rules.ballsPerOver)
  );
}

export function oversTextFor(legalBalls: number, ballsPerOver: number): string {
  const progress = overProgressFor(legalBalls, ballsPerOver);
  return `${progress.overNumber}.${progress.ballInOver}`;
}

export function runsConcededByBowler(event: DeliveryEvent): number {
  if (event.runs.extraKind === 'BYE' || event.runs.extraKind === 'LEG_BYE') return 0;
  return event.runs.bat + event.runs.extras;
}

function applyDeliveryToScorecard(
  event: DeliveryEvent,
  batters: Map<string, MutableBatterLine>,
  bowlers: Map<string, MutableBowlerLine>,
  extras: MutableExtrasBreakdown,
  playerName: (playerId: string) => string,
): void {
  const batter = ensureBatter(batters, event.strikerId);
  const bowler = ensureBowler(bowlers, event.bowlerId);

  batter.runs += event.runs.bat;
  if (event.runs.extraKind !== 'WIDE' && event.runs.extraKind !== 'NO_BALL') {
    batter.balls += 1;
  }
  if (event.runs.bat === 4) batter.fours += 1;
  if (event.runs.bat === 6) batter.sixes += 1;

  if (isLegalDelivery(event)) bowler.legalBalls += 1;
  bowler.runsConceded += runsConcededByBowler(event);
  if (event.runs.extraKind === 'WIDE') {
    bowler.wides += 1;
    extras.wides += event.runs.extras;
  }
  if (event.runs.extraKind === 'NO_BALL') {
    bowler.noBalls += 1;
    extras.noBalls += event.runs.extras;
  }
  if (event.runs.extraKind === 'BYE') extras.byes += event.runs.extras;
  if (event.runs.extraKind === 'LEG_BYE') extras.legByes += event.runs.extras;
  extras.total += event.runs.extras;

  if (event.wicket) {
    const outBatter = ensureBatter(batters, event.wicket.outPlayerId);
    outBatter.isOut = true;
    outBatter.dismissalText = dismissalTextFor(event, playerName);
    if (event.wicket.creditedToBowler) bowler.wickets += 1;
  }
}

function ensureBatter(lines: Map<string, MutableBatterLine>, userId: string): MutableBatterLine {
  const existing = lines.get(userId);
  if (existing) return existing;
  const line: MutableBatterLine = {
    userId,
    runs: 0,
    balls: 0,
    fours: 0,
    sixes: 0,
    isOut: false,
  };
  lines.set(userId, line);
  return line;
}

function ensureBowler(lines: Map<string, MutableBowlerLine>, userId: string): MutableBowlerLine {
  const existing = lines.get(userId);
  if (existing) return existing;
  const line: MutableBowlerLine = {
    userId,
    legalBalls: 0,
    runsConceded: 0,
    wickets: 0,
    wides: 0,
    noBalls: 0,
  };
  lines.set(userId, line);
  return line;
}

function finalizeBatterLine(line: MutableBatterLine): CanonicalBatterLine {
  return {
    ...line,
    strikeRate: line.balls === 0 ? 0 : (line.runs / line.balls) * 100,
  };
}

function finalizeBowlerLine(line: MutableBowlerLine, ballsPerOver: number): CanonicalBowlerLine {
  return {
    ...line,
    economy: line.legalBalls === 0 ? 0 : (line.runsConceded / line.legalBalls) * ballsPerOver,
    oversText: oversTextFor(line.legalBalls, ballsPerOver),
  };
}

function dismissalTextFor(event: DeliveryEvent, playerName: (playerId: string) => string): string {
  if (!event.wicket) return '';
  switch (event.wicket.kind) {
    case 'BOWLED':
      return `b ${playerName(event.bowlerId)}`;
    case 'CAUGHT':
      return `c ${playerName(event.wicket.fielderId ?? '')} b ${playerName(event.bowlerId)}`;
    case 'LBW':
      return `lbw b ${playerName(event.bowlerId)}`;
    case 'RUN_OUT':
      return event.wicket.assistantFielderId
        ? `run out (${playerName(event.wicket.assistantFielderId)} / ${playerName(event.wicket.fielderId ?? '')})`
        : `run out (${playerName(event.wicket.fielderId ?? '')})`;
    case 'STUMPED':
      return `st ${playerName(event.wicket.fielderId ?? '')} b ${playerName(event.bowlerId)}`;
    case 'HIT_WICKET':
      return `hit wicket b ${playerName(event.bowlerId)}`;
    case 'RETIRED_OUT':
      return 'retired out';
  }
}

function shortId(id: string): string {
  return id ? id.slice(0, 4) : '';
}
