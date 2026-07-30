import { battingPositionBand, DEFAULT_MVP_CONFIG, valueForMatchLength } from './config';
import type {
  MatchMvpInput, MatchMvpResult, MvpConfig, MvpExplanationItem, MvpParticipant,
  PlayerMvpResult, TournamentMvpRow,
} from './types';

type Mutable = {
  participant: MvpParticipant;
  runs: number; balls: number; teamRuns: number; teamBalls: number;
  wickets: number; legalBalls: number; conceded: number; teamConceded: number; teamBowlingBalls: number;
  wicketPoints: number; haul: number; performance: number; maidens: number; maidenPoints: number;
  catches: number; stumpings: number; direct: number; assisted: number;
  catchPoints: number; stumpingPoints: number; directPoints: number; assistedPoints: number;
  explanations: MvpExplanationItem[];
  adjustmentDataAvailable: boolean;
};

const BOWLER_WICKETS = new Set(['BOWLED', 'CAUGHT', 'LBW', 'STUMPED', 'HIT_WICKET']);

export function calculateMatchMvp(
  input: MatchMvpInput,
  config: MvpConfig = DEFAULT_MVP_CONFIG,
): MatchMvpResult {
  const byPlayer = new Map(input.participants.map(p => [p.playerId, empty(p)]));
  const participant = (id: string) => byPlayer.get(id);
  const baseWicketRuns = valueForMatchLength(config.bowling.baseRunsPerWicketByOvers, input.scheduledOvers, input.format);
  const fullWicketPoints = baseWicketRuns / config.runsPerMvpPoint;
  const factor = valueForMatchLength(config.batting.performanceFactorByOvers, input.scheduledOvers, input.format);
  const ballsPerOver = input.ballsPerOver ?? 6;

  for (const innings of input.innings.filter(item => !item.isSuperOver)) {
    const batting = input.participants.filter(p => p.teamId === innings.battingTeamId);
    const bowling = input.participants.filter(p => p.teamId === innings.bowlingTeamId);
    const wicketCounts = new Map<string, number>();
    if (innings.deliveries) {
      for (const item of [...batting, ...bowling]) participant(item.playerId)!.adjustmentDataAvailable = true;
      const overRuns = new Map<string, Map<number, number>>();
      const legalIndex = new Map<string, number>();
      for (const delivery of innings.deliveries) {
        const batter = participant(delivery.strikerId);
        const bowler = participant(delivery.bowlerId);
        if (batter) {
          batter.runs += delivery.runsBat;
          if (delivery.extraKind !== 'WIDE' && delivery.extraKind !== 'NO_BALL') batter.balls += 1;
        }
        if (bowler) {
          if (delivery.isLegal) {
            bowler.legalBalls += 1;
            legalIndex.set(delivery.bowlerId, (legalIndex.get(delivery.bowlerId) ?? 0) + 1);
          }
          if (delivery.extraKind !== 'BYE' && delivery.extraKind !== 'LEG_BYE') {
            bowler.conceded += delivery.runsBat + delivery.runsExtra;
          }
          const over = Math.floor(Math.max(0, (legalIndex.get(delivery.bowlerId) ?? 1) - 1) / ballsPerOver);
          const map = overRuns.get(delivery.bowlerId) ?? new Map<number, number>();
          if (delivery.extraKind !== 'BYE' && delivery.extraKind !== 'LEG_BYE') {
            map.set(over, (map.get(over) ?? 0) + delivery.runsBat + delivery.runsExtra);
          }
          overRuns.set(delivery.bowlerId, map);
        }
        if (!delivery.wicket) continue;
        const dismissed = participant(delivery.wicket.outPlayerId);
        const band = battingPositionBand(
          dismissed?.participant.battingPosition ?? batting.length,
          dismissed?.participant.teamSize ?? batting.length,
        );
        const strength = config.bowling.batterPositionStrength[band];
        const wicketPoints = fullWicketPoints * strength;
        if (bowler && delivery.wicket.creditedToBowler && BOWLER_WICKETS.has(delivery.wicket.kind)) {
          bowler.wickets += 1;
          bowler.wicketPoints += wicketPoints;
          wicketCounts.set(bowler.participant.playerId, (wicketCounts.get(bowler.participant.playerId) ?? 0) + 1);
          add(bowler, 'bowling', `BOWLING_WICKET_${band.toUpperCase()}_ORDER`,
            `Wicket of a ${band}-order batter`, wicketPoints, { batterId: delivery.wicket.outPlayerId });
        }
        const fielders = delivery.wicket.fielders.filter((id, index, all) => id && all.indexOf(id) === index);
        if (delivery.wicket.kind === 'CAUGHT' && fielders[0]) {
          const fielder = participant(fielders[0]);
          if (fielder && (fielder.participant.playerId !== delivery.bowlerId ||
              config.fielding.awardCaughtAndBowledFieldingCredit)) {
            const points = wicketPoints * config.fielding.assistedDismissalPercentage;
            fielder.catches += 1; fielder.catchPoints += points;
            add(fielder, 'fielding', 'FIELDING_CATCH', 'Catch', points, { batterId: delivery.wicket.outPlayerId });
          }
        } else if (delivery.wicket.kind === 'STUMPED' && fielders[0]) {
          const fielder = participant(fielders[0]);
          if (fielder) {
            const points = wicketPoints * config.fielding.assistedDismissalPercentage;
            fielder.stumpings += 1; fielder.stumpingPoints += points;
            add(fielder, 'fielding', 'FIELDING_STUMPING', 'Stumping', points);
          }
        } else if (delivery.wicket.kind === 'RUN_OUT' && fielders.length) {
          const direct = delivery.wicket.directHit ?? fielders.length === 1;
          const total = wicketPoints * (direct
            ? config.fielding.directHitRunOutPercentage
            : config.fielding.assistedRunOutPercentage);
          for (const id of fielders) {
            const fielder = participant(id);
            if (!fielder) continue;
            const points = total / fielders.length;
            if (direct) { fielder.direct += 1; fielder.directPoints += points; }
            else { fielder.assisted += 1; fielder.assistedPoints += points; }
            add(fielder, 'fielding', direct ? 'FIELDING_DIRECT_RUN_OUT' : 'FIELDING_ASSISTED_RUN_OUT',
              direct ? 'Direct-hit run-out' : 'Assisted run-out share', points,
              { creditedFielders: fielders.length });
          }
        }
      }
      for (const [id, overs] of overRuns) {
        const player = participant(id);
        if (!player) continue;
        player.maidens += [...overs.values()].filter(runs => runs === 0).length;
      }
    } else if (innings.summary) {
      for (const line of innings.summary.batters) {
        const player = participant(line.playerId);
        if (player) { player.runs += line.runs; player.balls += line.legalBalls; }
      }
      for (const line of innings.summary.bowlers) {
        const player = participant(line.playerId);
        if (!player) continue;
        player.legalBalls += line.legalBalls; player.conceded += line.runsConceded;
        player.wickets += line.wickets; player.maidens += line.maidens ?? 0;
        // Batter-position-aware wicket value cannot be invented from aggregate summaries.
      }
    }
    for (const player of bowling) {
      const value = wicketCounts.get(player.playerId) ?? 0;
      const state = participant(player.playerId)!;
      const achieved = config.bowling.wicketHaulBonuses.filter(b => value >= b.wickets);
      const selected = config.bowling.wicketHaulBonusesCumulative ? achieved : achieved.slice(-1);
      for (const bonus of selected) {
        state.haul += bonus.points;
        add(state, 'bowling', bonus.code, `${bonus.wickets}-wicket haul bonus`, bonus.points);
      }
    }
  }

  for (const state of byPlayer.values()) {
    const teamBatters = [...byPlayer.values()].filter(p => p.participant.teamId === state.participant.teamId);
    state.teamRuns = teamBatters.reduce((n, p) => n + p.runs, 0);
    state.teamBalls = teamBatters.reduce((n, p) => n + p.balls, 0);
    state.teamConceded = teamBatters.reduce((n, p) => n + p.conceded, 0);
    state.teamBowlingBalls = teamBatters.reduce((n, p) => n + p.legalBalls, 0);
    const base = state.runs / config.runsPerMvpPoint;
    if (base) add(state, 'batting', 'BATTING_RUNS', `${state.runs} batting runs`, base, { runs: state.runs });
    const playerRate = state.balls ? state.runs / state.balls : 0;
    const teamRate = state.teamBalls ? state.teamRuns / state.teamBalls : 0;
    const strikeBonus = state.balls >= config.batting.minimumBallsForStrikeRateAdjustment &&
      teamRate > 0 && playerRate > teamRate ? base * (playerRate / teamRate) * factor : 0;
    if (strikeBonus) add(state, 'batting', 'BATTING_STRIKE_RATE_BONUS',
      'Strike rate above team rate', strikeBonus, { playerRate, teamRate });

    const minBalls = valueForMatchLength(
      config.bowling.minimumLegalBallsForBowlingAdjustmentByOvers, input.scheduledOvers, input.format);
    const playerRpb = state.legalBalls ? state.conceded / state.legalBalls : 0;
    const teamRpb = state.teamBowlingBalls ? state.teamConceded / state.teamBowlingBalls : 0;
    if (state.legalBalls >= minBalls && playerRpb > 0 && playerRpb < teamRpb) {
      state.performance = Math.min(
        config.bowling.maximumBowlingPerformanceBonus,
        (teamRpb / playerRpb) * valueForMatchLength(
          config.bowling.performanceFactorByOvers, input.scheduledOvers, input.format),
      );
      add(state, 'bowling', 'BOWLING_PERFORMANCE_BONUS',
        'Runs conceded per ball better than team rate', state.performance, { playerRpb, teamRpb });
    }
    const maidenEquivalent = valueForMatchLength(
      config.bowling.maidensPerWicketEquivalentByOvers, input.scheduledOvers, input.format);
    state.maidenPoints = state.maidens * fullWicketPoints / maidenEquivalent;
    if (state.maidenPoints) add(state, 'bowling', 'BOWLING_MAIDEN_BONUS',
      `${state.maidens} maiden over${state.maidens === 1 ? '' : 's'}`, state.maidenPoints);
  }

  const calculatedAt = input.calculatedAt ?? new Date().toISOString();
  const raw = [...byPlayer.values()].map(state => resultFor(state, input, config, calculatedAt));
  const ordered = raw.sort((a, b) => compare(a, b, input));
  let previous: PlayerMvpResult | undefined;
  ordered.forEach((item, index) => {
    item.order = index + 1;
    item.rank = previous && item.totalPoints === previous.totalPoints ? previous.rank : index + 1;
    previous = item;
  });
  selectAwards(ordered, input, config);
  return {
    matchId: input.matchId, algorithmVersion: config.version, calculatedAt,
    playerOfTheMatchId: ordered.find(p => p.isPlayerOfTheMatch)?.playerId,
    fighterOfTheMatchId: ordered.find(p => p.isFighterOfTheMatch)?.playerId,
    rankings: ordered,
  };
}

function empty(participant: MvpParticipant): Mutable {
  return {
    participant, runs: 0, balls: 0, teamRuns: 0, teamBalls: 0, wickets: 0,
    legalBalls: 0, conceded: 0, teamConceded: 0, teamBowlingBalls: 0,
    wicketPoints: 0, haul: 0, performance: 0, maidens: 0, maidenPoints: 0,
    catches: 0, stumpings: 0, direct: 0, assisted: 0, catchPoints: 0,
    stumpingPoints: 0, directPoints: 0, assistedPoints: 0, explanations: [],
    adjustmentDataAvailable: false,
  };
}

function add(state: Mutable, category: MvpExplanationItem['category'], code: string,
  label: string, points: number, metadata?: Record<string, unknown>): void {
  state.explanations.push({ category, code, label, points, metadata });
}

function resultFor(state: Mutable, input: MatchMvpInput, config: MvpConfig, at: string): PlayerMvpResult {
  const battingPoints = sum(state.explanations, 'batting');
  const bowlingPoints = state.wicketPoints + state.haul + state.performance + state.maidenPoints;
  const fieldingPoints = state.catchPoints + state.stumpingPoints + state.directPoints + state.assistedPoints;
  const round = (n: number) => Number(n.toFixed(config.precisionDecimalPlaces));
  return {
    matchId: input.matchId, playerId: state.participant.playerId, teamId: state.participant.teamId,
    battingPoints: round(battingPoints), bowlingPoints: round(bowlingPoints),
    fieldingPoints: round(fieldingPoints), totalPoints: round(battingPoints + bowlingPoints + fieldingPoints),
    rank: null, order: 0,
    battingBreakdown: {
      runs: state.runs, legalBalls: state.balls, teamBatRuns: state.teamRuns,
      teamLegalBalls: state.teamBalls, basePoints: round(state.runs / config.runsPerMvpPoint),
      strikeRateBonus: round(battingPoints - state.runs / config.runsPerMvpPoint),
      strikeRateAdjustmentAvailable: state.adjustmentDataAvailable,
    },
    bowlingBreakdown: {
      wickets: state.wickets, legalBalls: state.legalBalls, runsConceded: state.conceded,
      wicketPoints: round(state.wicketPoints), wicketHaulBonus: round(state.haul),
      performanceBonus: round(state.performance), maidenOvers: state.maidens,
      maidenBonus: round(state.maidenPoints), performanceAdjustmentAvailable: state.adjustmentDataAvailable,
    },
    fieldingBreakdown: {
      catches: state.catches, stumpings: state.stumpings, directHitRunOuts: state.direct,
      assistedRunOuts: state.assisted, catchPoints: round(state.catchPoints),
      stumpingPoints: round(state.stumpingPoints), directHitRunOutPoints: round(state.directPoints),
      assistedRunOutPoints: round(state.assistedPoints),
    },
    explanations: state.explanations.map(item => ({ ...item, points: round(item.points) })),
    isPlayerOfTheMatch: false, isFighterOfTheMatch: false,
    algorithmVersion: config.version, calculatedAt: at,
  };
}

function sum(items: readonly MvpExplanationItem[], category: string): number {
  return items.filter(item => item.category === category).reduce((n, item) => n + item.points, 0);
}

function compare(a: PlayerMvpResult, b: PlayerMvpResult, input: MatchMvpInput): number {
  const winner = input.result?.winnerTeamId;
  const values: [number | string, number | string][] = [
    [b.totalPoints, a.totalPoints],
    [Number(b.teamId === winner), Number(a.teamId === winner)],
    [b.bowlingBreakdown.wickets, a.bowlingBreakdown.wickets],
    [b.fieldingPoints, a.fieldingPoints],
    [b.battingBreakdown.runs, a.battingBreakdown.runs],
    [rate(b.battingBreakdown.runs, b.battingBreakdown.legalBalls),
      rate(a.battingBreakdown.runs, a.battingBreakdown.legalBalls)],
    [-rate(b.bowlingBreakdown.runsConceded, b.bowlingBreakdown.legalBalls),
      -rate(a.bowlingBreakdown.runsConceded, a.bowlingBreakdown.legalBalls)],
    [a.playerId, b.playerId],
  ];
  for (const [left, right] of values) {
    if (left === right) continue;
    return left < right ? -1 : 1;
  }
  return 0;
}

function rate(value: number, denominator: number): number {
  return denominator ? value / denominator : Number.NEGATIVE_INFINITY;
}

function selectAwards(rows: PlayerMvpResult[], input: MatchMvpInput, config: MvpConfig): void {
  if (input.status !== 'COMPLETED' || !rows.length || input.result?.kind === 'NO_RESULT') return;
  const winner = input.result?.winnerTeamId;
  const eligible = rows.slice(0, config.awards.playerOfMatchWinningTeamTopRankLimit);
  const pom = winner ? eligible.find(row => row.teamId === winner) ?? rows[0]
    : input.result?.kind === 'TIE' && config.awards.awardPlayerOfMatchForCompletedTie ? rows[0] : undefined;
  if (pom) pom.isPlayerOfTheMatch = true;
  if (!winner) return;
  const loser = rows.find(row => row.teamId !== winner &&
    row.order <= config.awards.fighterOfMatchTopRankLimit && row.playerId !== pom?.playerId);
  if (loser) loser.isFighterOfTheMatch = true;
}

export function aggregateTournamentMvp(matches: readonly MatchMvpResult[]): TournamentMvpRow[] {
  const map = new Map<string, Omit<TournamentMvpRow, 'rank'>>();
  for (const match of matches) for (const row of match.rankings) {
    const current = map.get(row.playerId) ?? {
      playerId: row.playerId, teamIds: [], matchesPlayed: 0, battingPoints: 0,
      bowlingPoints: 0, fieldingPoints: 0, totalPoints: 0, playerOfTheMatchCount: 0,
      fighterOfTheMatchCount: 0, topThreeCount: 0, runs: 0, wickets: 0,
      fieldingDismissals: 0, algorithmVersions: [],
    };
    current.teamIds = [...new Set([...current.teamIds, row.teamId])];
    current.algorithmVersions = [...new Set([...current.algorithmVersions, row.algorithmVersion])];
    current.matchesPlayed += 1; current.battingPoints += row.battingPoints;
    current.bowlingPoints += row.bowlingPoints; current.fieldingPoints += row.fieldingPoints;
    current.totalPoints += row.totalPoints; current.playerOfTheMatchCount += Number(row.isPlayerOfTheMatch);
    current.fighterOfTheMatchCount += Number(row.isFighterOfTheMatch);
    current.topThreeCount += Number(row.order <= 3); current.runs += row.battingBreakdown.runs;
    current.wickets += row.bowlingBreakdown.wickets;
    current.fieldingDismissals += row.fieldingBreakdown.catches + row.fieldingBreakdown.stumpings +
      row.fieldingBreakdown.directHitRunOuts + row.fieldingBreakdown.assistedRunOuts;
    map.set(row.playerId, current);
  }
  return [...map.values()].sort((a, b) =>
    b.totalPoints - a.totalPoints || b.playerOfTheMatchCount - a.playerOfTheMatchCount ||
    b.topThreeCount - a.topThreeCount || b.wickets - a.wickets || b.runs - a.runs ||
    b.fieldingDismissals - a.fieldingDismissals || a.matchesPlayed - b.matchesPlayed ||
    a.playerId.localeCompare(b.playerId)).map((row, index) => ({ ...row, rank: index + 1 }));
}

