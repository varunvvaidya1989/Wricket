import {
  getMatch, getMatchXI, listBalls, listInningsForMatch, listMatches,
} from '../db/repo';
import {
  getStoredMatchMvp, listStoredTournamentMvpMatches, recordMatchMvpFailure, replaceMatchMvp,
} from '../db/mvpRepo';
import {
  aggregateTournamentMvp, calculateMatchMvp, DEFAULT_MVP_CONFIG,
} from '../domain/mvp';
import { isBowlerCreditedWicket } from '../domain/scoring/events';
import type { MatchMvpResult, MvpDelivery, TournamentMvpRow } from '../domain/mvp';

export async function recalculateMatchMvp(matchId: string): Promise<MatchMvpResult> {
  try {
    const match = await getMatch(matchId);
    if (!match) throw new Error('Match not found');
    const [teamA, teamB, innings] = await Promise.all([
      getMatchXI(matchId, match.teamAId), getMatchXI(matchId, match.teamBId),
      listInningsForMatch(matchId),
    ]);
    const participants = [
      ...teamA.map(p => ({ playerId: p.userId, teamId: match.teamAId, battingPosition: p.battingOrder, teamSize: teamA.length })),
      ...teamB.map(p => ({ playerId: p.userId, teamId: match.teamBId, battingPosition: p.battingOrder, teamSize: teamB.length })),
    ];
    const inningsInput = await Promise.all(innings.map(async item => ({
      id: item.id, battingTeamId: item.battingTeamId, bowlingTeamId: item.bowlingTeamId,
      deliveries: (await listBalls(item.id)).map(ball => ({
        inningsId: item.id, strikerId: ball.strikerId, bowlerId: ball.bowlerId,
        runsBat: ball.runsBat, runsExtra: ball.runsExtra, extraKind: ball.extraKind,
        isLegal: ball.isLegal,
        wicket: ball.dismissal ? {
          kind: ball.dismissal.kind, outPlayerId: ball.dismissal.outPlayerId,
          creditedToBowler: isBowlerCreditedWicket(ball.dismissal.kind),
          fielders: [ball.dismissal.fielderId, ball.dismissal.assistantFielderId]
            .filter((id): id is string => Boolean(id)),
          directHit: ball.dismissal.kind === 'RUN_OUT' && !ball.dismissal.assistantFielderId,
        } : undefined,
      } satisfies MvpDelivery)),
    })));
    const result = calculateMatchMvp({
      matchId, tournamentId: match.tournamentId ?? undefined, format: match.format,
      scheduledOvers: match.rules.oversPerInnings, status: match.status, result: match.result,
      participants, innings: inningsInput,
    });
    await replaceMatchMvp(result);
    return result;
  } catch (error) {
    await recordMatchMvpFailure(matchId, DEFAULT_MVP_CONFIG.version, error);
    throw error;
  }
}

export async function getMatchMvp(matchId: string): Promise<MatchMvpResult | null> {
  return getStoredMatchMvp(matchId, DEFAULT_MVP_CONFIG.version);
}

export async function getTournamentMvp(tournamentId: string): Promise<TournamentMvpRow[]> {
  const matches = (await listMatches(tournamentId)).filter(match =>
    match.status === 'COMPLETED' && match.result?.kind !== 'NO_RESULT');
  const stored = await listStoredTournamentMvpMatches(matches.map(match => match.id));
  return aggregateTournamentMvp(stored);
}

export async function backfillTournamentMvp(tournamentId: string): Promise<{ processed: number; failed: string[] }> {
  const matches = (await listMatches(tournamentId)).filter(match => match.status === 'COMPLETED');
  const failed: string[] = [];
  for (const match of matches) {
    try { await recalculateMatchMvp(match.id); } catch { failed.push(match.id); }
  }
  return { processed: matches.length - failed.length, failed };
}
