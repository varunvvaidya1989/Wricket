import type { CloudLiveMatch, CloudMatchEvent } from '@/lib/supabase/liveMatchApi';
import { spectatorHistory } from './spectatorHistory';

export interface CompleteInningsScorecardData {
  inningsId: string;
  sequence: number;
  battingTeamId: string;
  totalRuns: number;
  totalWickets: number;
  totalBalls: number;
  batters: { id: string; runs: number; balls: number; fours: number; sixes: number; out: boolean; dismissal?: string }[];
  bowlers: { id: string; runs: number; balls: number; wickets: number }[];
}
export type CompleteScorecardData = CompleteInningsScorecardData[];

export function buildCompleteScorecard(match: CloudLiveMatch): CompleteScorecardData {
  const rowsByInnings = new Map<string, {
    batters: Map<string, CompleteInningsScorecardData['batters'][number]>;
    bowlers: Map<string, CompleteInningsScorecardData['bowlers'][number]>;
  }>();
  match.allInnings.forEach(innings => {
    rowsByInnings.set(innings.id, { batters: new Map(), bowlers: new Map() });
  });

  spectatorHistory(match.commentary).reverse().forEach(event => {
    const payload = event.payload;
    const rows = rowsByInnings.get(String(payload.innings_id ?? ''));
    if (!rows) return;
    if (event.kind === 'BATTER_RETIRED') {
      const id = String(payload.player_id ?? '');
      if (!id) return;
      const batter = rows.batters.get(id) ?? { id, runs: 0, balls: 0, fours: 0, sixes: 0, out: false };
      batter.out = payload.retirement_kind === 'RETIRED_OUT';
      batter.dismissal = batter.out ? 'retired out' : 'retired hurt';
      rows.batters.set(id, batter);
      return;
    }
    if (event.kind !== 'BALL_RECORDED') return;
    for (const value of [payload.striker_id, payload.non_striker_id]) {
      if (typeof value !== 'string' || !value) continue;
      const row = rows.batters.get(value) ?? { id: value, runs: 0, balls: 0, fours: 0, sixes: 0, out: false };
      if (row.dismissal === 'retired hurt') row.dismissal = undefined;
      rows.batters.set(value, row);
    }
    const striker = String(payload.striker_id ?? '');
    const bowler = String(payload.bowler_id ?? '');
    const batRuns = Number(payload.runs_bat ?? 0);
    const extraKind = String(payload.extra_kind ?? '');
    const bowlerRuns = batRuns +
      (extraKind === 'BYE' || extraKind === 'LEG_BYE' ? 0 : Number(payload.runs_extra ?? 0));
    const legal = Boolean(payload.is_legal);

    if (striker) {
      const batter = rows.batters.get(striker) ??
        { id: striker, runs: 0, balls: 0, fours: 0, sixes: 0, out: false };
      batter.runs += batRuns;
      batter.balls += legal ? 1 : 0;
      batter.fours += batRuns === 4 ? 1 : 0;
      batter.sixes += batRuns === 6 ? 1 : 0;
      rows.batters.set(striker, batter);
    }
    if (bowler) {
      const bowling = rows.bowlers.get(bowler) ?? { id: bowler, runs: 0, balls: 0, wickets: 0 };
      bowling.runs += bowlerRuns;
      bowling.balls += legal ? 1 : 0;
      if (
        payload.is_wicket &&
        !['RUN_OUT', 'RETIRED_OUT', 'OBSTRUCTING_FIELD', 'TIMED_OUT'].includes(
          String(payload.dismissal_kind ?? ''),
        )
      ) {
        bowling.wickets += 1;
      }
      rows.bowlers.set(bowler, bowling);
    }
    const outId = typeof payload.out_player_id === 'string' ? payload.out_player_id : undefined;
    if (outId) {
      const batter = rows.batters.get(outId) ??
        { id: outId, runs: 0, balls: 0, fours: 0, sixes: 0, out: false };
      batter.out = true;
      batter.dismissal = dismissalScorecardText(match, event);
      rows.batters.set(outId, batter);
    }
  });

  return match.allInnings.map(innings => {
    const rows = rowsByInnings.get(innings.id)!;
    return {
      inningsId: innings.id,
      sequence: innings.sequence,
      battingTeamId: innings.battingTeamId,
      totalRuns: innings.totalRuns,
      totalWickets: innings.totalWickets,
      totalBalls: innings.totalBalls,
      batters: [...rows.batters.values()],
      bowlers: [...rows.bowlers.values()],
    };
  });
}

function dismissalScorecardText(match: CloudLiveMatch, event: CloudMatchEvent): string {
  const payload = event.payload;
  const kind = stringValue(payload.dismissal_kind) ?? 'WICKET';
  const bowler = playerName(match, payload.bowler_id, 'Bowler');
  const fielder = playerName(match, payload.fielder_id, 'fielder');
  const thrower = playerName(match, payload.assistant_fielder_id, fielder);
  switch (kind) {
    case 'BOWLED':
      return `b ${bowler}`;
    case 'CAUGHT':
      return `c ${fielder} b ${bowler}`;
    case 'LBW':
      return `lbw b ${bowler}`;
    case 'RUN_OUT':
      return thrower === fielder
        ? `run out ${fielder}`
        : `run out ${thrower} / ${fielder}`;
    case 'STUMPED':
      return `st ${fielder} b ${bowler}`;
    case 'HIT_WICKET':
      return `hit wicket b ${bowler}`;
    case 'RETIRED_OUT':
      return 'retired out';
    default:
      return kind.replaceAll('_', ' ').toLowerCase();
  }
}

function playerName(match: CloudLiveMatch, value: unknown, fallback: string): string {
  const id = stringValue(value);
  return id ? match.playerNames[id] ?? fallback : fallback;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}
