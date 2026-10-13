import type { CloudLiveMatch } from '@/lib/supabase/liveMatchApi';
import { matchStatus } from './status';

export function matchSharePath(id: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error('This match cannot be shared yet.');
  return `/match?id=${encodeURIComponent(id)}`;
}

export function matchShareUrl(id: string, origin = 'https://sportstageapp.expo.app'): string {
  return `${new URL(origin).origin}${matchSharePath(id)}`;
}

export function spectatorResult(match: CloudLiveMatch): string {
  const result = match.result ?? {};
  const kind = String(result.kind ?? result.resultKind ?? result.result_kind ?? match.status);
  if (kind === 'TIE') return 'Match tied';
  if (kind === 'DRAW') return 'Match drawn';
  if (kind === 'NO_RESULT') return 'No result';
  if (kind === 'CANCELLED') return 'Match cancelled';
  const winnerId = result.winnerTeamId ?? result.winner_team_id;
  const winner = [match.teamA, match.teamB].find(team => team.id === winnerId)?.name;
  if (kind === 'WALKOVER' && winner) return `${winner} won by walkover`;
  const margin = Number(result.margin);
  const unit = result.marginUnit ?? result.margin_unit;
  if (winner && Number.isFinite(margin) && typeof unit === 'string') {
    const label = margin === 1 ? unit.toLowerCase().replace(/s$/, '') : unit.toLowerCase();
    return `${winner} won by ${kind === 'WIN_BY_INNINGS' ? 'an innings and ' : ''}${margin} ${label}`;
  }
  if (winner) return `${winner} won the match`;
  if (match.status === 'ABANDONED') return 'Match abandoned';
  return matchStatus(match.status).terminal ? 'Match ended · result unavailable' : matchStatus(match.status).label;
}

// Explicit allowlist: callers never serialize rules, squads or private contact data.
export function matchShareSummary(match: CloudLiveMatch) {
  const terminal = matchStatus(match.status).terminal;
  const team = match.innings?.battingTeamId === match.teamB.id ? match.teamB : match.teamA;
  return { id: match.id, title: `${match.teamA.name} vs ${match.teamB.name}`, tournament: match.tournamentName,
    team: team.name, opponent: team.id === match.teamA.id ? match.teamB.name : match.teamA.name, status: matchStatus(match.status).label, terminal,
    score: match.innings ? `${match.score.runs}/${match.score.wickets}` : 'Awaiting play',
    balls: match.score.legalBalls, result: terminal ? spectatorResult(match) : '',
    target: match.innings?.target, overs: Number(match.rules.oversPerInnings ?? 0),
    innings: match.allInnings.map(innings => ({ id: innings.id, sequence: innings.sequence,
      team: innings.battingTeamId === match.teamB.id ? match.teamB.name : match.teamA.name,
      runs: innings.totalRuns, wickets: innings.totalWickets, balls: innings.totalBalls })) };
}
