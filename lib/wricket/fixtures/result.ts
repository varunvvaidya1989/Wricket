import type { FixtureMatch } from './types';

export function fixtureWinner(match: FixtureMatch): string {
  if (!['COMPLETED', 'WALKOVER'].includes(match.status)) throw new Error('This match is not complete.');
  const winner = match.result?.winnerTeamId ?? match.result?.winner_team_id;
  if (typeof winner === 'string') {
    if (winner !== match.teamA && winner !== match.teamB) throw new Error('The recorded winner is not a participant.');
    return winner;
  }
  const kind = String(match.result?.kind ?? match.result?.result_kind ?? '');
  if (['NO_RESULT', 'CANCELLED', 'ABANDONED', 'TIE', 'DRAW'].includes(kind)) throw new Error('Resolve this knockout result before advancing.');
  if (!match.teamB) return match.teamA;
  // Canonical results take precedence; older fixtures may contain scores only.
  if (Object.keys(match.result ?? {}).length) throw new Error('The recorded result has no winner.');
  if (match.scoreA == null || match.scoreB == null || match.scoreA === match.scoreB) throw new Error('This knockout match needs a winner before advancing.');
  return match.scoreA > match.scoreB ? match.teamA : match.teamB;
}

export function fixtureLoser(match: FixtureMatch): string {
  const winner = fixtureWinner(match);
  if (!match.teamB) throw new Error('A bye has no losing team.');
  return winner === match.teamA ? match.teamB : match.teamA;
}
