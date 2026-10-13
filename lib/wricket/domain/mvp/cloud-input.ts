import { activeStatisticsBalls, bowlerCreditedWicket, type StatisticsEvent } from '../statistics';
import type { MatchFormat, MatchResult } from '../types';
import type { MatchMvpInput, MvpDelivery } from './types';

export interface CloudMvpSnapshot {
  match: { id: string; tournament_id: string | null; format: MatchFormat; status: string; result: MatchResult | null; rules: { oversPerInnings?: number; overs?: number; ballsPerOver?: number } };
  xis: { player_id: string; team_id: string; batting_order: number }[];
  innings: { id: string; batting_team_id: string; bowling_team_id: string; sequence: number }[];
  events: StatisticsEvent[];
}

export function cloudMvpInput(snapshot: CloudMvpSnapshot): MatchMvpInput {
  const { match, xis, innings, events } = snapshot;
  if (match.status !== 'COMPLETED') throw new Error('MVP requires a completed match');
  // Older hosted matches persisted the explicit innings limit as `overs`.
  // Prefer the current field when present and never infer a missing limit.
  const overs = Number(match.rules.oversPerInnings ?? match.rules.overs);
  if (!Number.isFinite(overs) || overs <= 0) throw new Error('Completed match has no valid innings limit');
  const deliveries = activeStatisticsBalls(events).filter(event => event.match_id === match.id);
  return {
    matchId: match.id, tournamentId: match.tournament_id ?? undefined, format: match.format,
    scheduledOvers: overs, ballsPerOver: match.rules.ballsPerOver ?? 6, status: 'COMPLETED', result: match.result ?? undefined,
    participants: xis.map(player => ({ playerId: player.player_id, teamId: player.team_id,
      battingPosition: player.batting_order, teamSize: xis.filter(other => other.team_id === player.team_id).length })),
    innings: innings.map(innings => ({
      id: innings.id, battingTeamId: innings.batting_team_id, bowlingTeamId: innings.bowling_team_id,
      deliveries: deliveries.filter(event => event.payload?.innings_id === innings.id).map(event => {
        const payload = event.payload ?? {};
        const extra = payload.extra_kind;
        return {
          inningsId: innings.id, strikerId: String(payload.striker_id), bowlerId: String(payload.bowler_id),
          runsBat: Number(payload.runs_bat ?? 0), runsExtra: Number(payload.runs_extra ?? 0),
          extraKind: extra === 'WIDE' || extra === 'NO_BALL' || extra === 'BYE' || extra === 'LEG_BYE' ? extra : null,
          isLegal: Boolean(payload.is_legal),
          wicket: payload.is_wicket ? {
            kind: String(payload.dismissal_kind), outPlayerId: String(payload.out_player_id),
            creditedToBowler: bowlerCreditedWicket(payload),
            fielders: [payload.fielder_id, payload.assistant_fielder_id].filter((id): id is string => typeof id === 'string'),
            directHit: payload.dismissal_kind === 'RUN_OUT' && !payload.assistant_fielder_id,
          } : undefined,
        } satisfies MvpDelivery;
      }),
    })),
  };
}
