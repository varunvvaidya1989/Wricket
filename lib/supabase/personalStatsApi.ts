import { readIdChunks, readPages } from './readPages';
import { getSupabaseClient } from './client';
import { activeStatisticsBalls, bowlerCreditedWicket, matchesInPeriod, type PerformancePeriod } from '@/lib/wricket/presentation/completedStatistics';

export interface PerformanceFormEntry {
  matchId: string;
  value: number;
  date: string;
  label: string;
}

export interface PerformanceHistoryEntry {
  matchId: string;
  opponentName: string;
  tournamentName: string;
  date: string;
  result: 'W' | 'L' | 'T' | 'NR';
  runs: number;
  balls: number;
  wickets: number;
  runsConceded: number;
  standout: boolean;
}

export interface PersonalStats {
  playerIds: string[];
  matches: number;
  innings: number;
  runs: number;
  ballsFaced: number;
  fours: number;
  sixes: number;
  highScore: number;
  dismissals: number;
  wickets: number;
  bowlingBalls: number;
  runsConceded: number;
  bestWickets: number;
  catches: number;
  recentScores: PerformanceFormEntry[];
  recentWickets: PerformanceFormEntry[];
  history: PerformanceHistoryEntry[];
}

export const personalStatsApi = {
  async get(userId: string, period: PerformancePeriod = 'career'): Promise<PersonalStats> {
    const client = getSupabaseClient();
    const { data: links, error: linkError } = await client.from('player_account_links')
      .select('player_id')
      .eq('account_id', userId);
    if (linkError && !['PGRST205', '42P01'].includes(linkError.code ?? '')) throw linkError;
    if (links?.length) return this.getForPlayerIds(links.map(link => link.player_id), period);
    const { data: candidates, error: playerError } = await client.from('players').select('id').eq('profile_id', userId);
    if (playerError) throw playerError;
    return this.getForPlayerIds(candidates.map(player => player.id), period);
  },

  async getForPlayerIds(playerIds: string[], period: PerformancePeriod = 'career'): Promise<PersonalStats> {
    if (!playerIds.length) return emptyStats();
    const client = getSupabaseClient();
    const xis = await readIdChunks(playerIds, chunk => readPages((start, end) => client.from('match_xis')
      .select('match_id, team_id, player_id').in('player_id', chunk)
      .order('match_id').order('team_id').order('player_id').range(start, end)));
    const allMatchIds = Array.from(new Set(xis.map(row => row.match_id)));
    if (!allMatchIds.length) return { ...emptyStats(), playerIds };

    const matchRows = await readIdChunks(allMatchIds, chunk => readPages((start, end) => client.from('matches')
      .select('id, tournament_id, team_a_id, team_b_id, status, result, scheduled_at, created_at')
      .in('id', chunk).order('id').range(start, end)));
    const playedRows = matchesInPeriod(matchRows, period);
    const matchIds = playedRows.map(match => match.id);
    if (!matchIds.length) return { ...emptyStats(), playerIds };

    const teamIds = Array.from(new Set(playedRows.flatMap(match => [match.team_a_id, match.team_b_id])));
    const tournamentIds = Array.from(new Set(playedRows.flatMap(match => match.tournament_id ? [match.tournament_id] : [])));
    const [teams, tournaments] = await Promise.all([
      readIdChunks(teamIds, chunk => readPages((start, end) => client.from('teams').select('id, name').in('id', chunk).order('id').range(start, end))),
      readIdChunks(tournamentIds, chunk => readPages((start, end) => client.from('tournaments').select('id, name').in('id', chunk).order('id').range(start, end))),
    ]);
    const events = await readIdChunks(matchIds, chunk => readPages((start, end) => client.from('match_events')
      .select('id, client_event_id, match_id, kind, payload, sequence, created_at')
      .in('match_id', chunk).order('created_at').order('id').range(start, end)));
    return aggregatePersonalStatistics(playerIds, playedRows, xis, events, teams, tournaments ?? []);
  },
};

export function aggregatePersonalStatistics(
  playerIds: string[],
  matches: any[],
  xis: any[],
  events: any[],
  teams: any[],
  tournaments: any[],
): PersonalStats {
  const ids = new Set(playerIds);
  const teamNames = new Map(teams.map(team => [team.id, team.name]));
  const tournamentNames = new Map(tournaments.map(tournament => [tournament.id, tournament.name]));
  const matchById = new Map(matches.map(match => [match.id, match]));
  const playerTeamByMatch = new Map<string, string>();
  xis.forEach(row => { if (ids.has(row.player_id)) playerTeamByMatch.set(row.match_id, row.team_id); });
  const inningsScores = new Map<string, { matchId: string; runs: number }>();
  const perMatch = new Map<string, { runs: number; balls: number; wickets: number; runsConceded: number; bowled: boolean }>();
  const stats = { ...emptyStats(), playerIds, matches: matches.length };

  const matchContribution = (matchId: string) => {
    const current = perMatch.get(matchId) ?? { runs: 0, balls: 0, wickets: 0, runsConceded: 0, bowled: false };
    perMatch.set(matchId, current);
    return current;
  };
  for (const event of activeStatisticsBalls(events)) {
    const p = event.payload ?? {};
    if (event.kind !== 'BALL_RECORDED') continue;
    const contribution = matchContribution(event.match_id);
    const inningsId = `${event.match_id}:${String(p.innings_id ?? '')}`;
    if (ids.has(String(p.striker_id))) {
      const runs = Number(p.runs_bat ?? 0);
      const legalForBatter = p.extra_kind !== 'WIDE';
      stats.runs += runs;
      stats.ballsFaced += legalForBatter ? 1 : 0;
      stats.fours += runs === 4 ? 1 : 0;
      stats.sixes += runs === 6 ? 1 : 0;
      contribution.runs += runs;
      contribution.balls += legalForBatter ? 1 : 0;
      const innings = inningsScores.get(inningsId) ?? { matchId: event.match_id, runs: 0 };
      innings.runs += runs;
      inningsScores.set(inningsId, innings);
    }
    if (p.is_wicket && ids.has(String(p.out_player_id))) stats.dismissals += 1;
    if (ids.has(String(p.bowler_id))) {
      contribution.bowled = true;
      if (p.is_legal) stats.bowlingBalls += 1;
      const conceded = Number(p.runs_bat ?? 0) +
        (p.extra_kind === 'BYE' || p.extra_kind === 'LEG_BYE' ? 0 : Number(p.runs_extra ?? 0));
      stats.runsConceded += conceded;
      contribution.runsConceded += conceded;
      if (bowlerCreditedWicket(p)) {
        stats.wickets += 1;
        contribution.wickets += 1;
      }
    }
    if (p.is_wicket && ids.has(String(p.fielder_id)) && p.dismissal_kind === 'CAUGHT') stats.catches += 1;
  }

  const matchDate = (matchId: string) => {
    const match = matchById.get(matchId);
    return String(match?.scheduled_at ?? match?.created_at ?? new Date(0).toISOString());
  };
  const labelFor = (date: string) => new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(new Date(date));
  stats.innings = inningsScores.size;
  stats.highScore = Math.max(0, ...[...inningsScores.values()].map(item => item.runs));
  stats.bestWickets = Math.max(0, ...[...perMatch.values()].map(item => item.wickets));
  stats.recentScores = [...inningsScores.values()]
    .map(item => ({ matchId: item.matchId, value: item.runs, date: matchDate(item.matchId), label: labelFor(matchDate(item.matchId)) }))
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
    .slice(0, 5);
  stats.recentWickets = [...perMatch.entries()]
    .filter(([, item]) => item.bowled)
    .map(([matchId, item]) => ({ matchId, value: item.wickets, date: matchDate(matchId), label: labelFor(matchDate(matchId)) }))
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
    .slice(0, 5);
  stats.history = matches
    .filter(match => ['COMPLETED', 'ABANDONED'].includes(match.status))
    .map(match => {
      const ownTeamId = playerTeamByMatch.get(match.id);
      const opponentId = ownTeamId === match.team_a_id ? match.team_b_id : match.team_a_id;
      const winnerId = match.result?.winnerTeamId ?? match.result?.winner_team_id;
      const kind = String(match.result?.kind ?? match.result?.result_kind ?? '');
      const contribution = perMatch.get(match.id) ?? { runs: 0, balls: 0, wickets: 0, runsConceded: 0 };
      const result: PerformanceHistoryEntry['result'] = kind === 'TIE' || kind === 'DRAW'
        ? 'T'
        : !winnerId || kind === 'NO_RESULT' ? 'NR' : winnerId === ownTeamId ? 'W' : 'L';
      return {
        matchId: match.id,
        opponentName: teamNames.get(opponentId) ?? 'Opponent',
        tournamentName: tournamentNames.get(match.tournament_id) ?? 'Independent match',
        date: matchDate(match.id),
        result,
        ...contribution,
        standout: contribution.runs >= 40 || contribution.wickets >= 3,
      };
    })
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  return stats;
}

function emptyStats(): PersonalStats {
  return {
    playerIds: [], matches: 0, innings: 0, runs: 0, ballsFaced: 0, fours: 0, sixes: 0,
    highScore: 0, dismissals: 0, wickets: 0, bowlingBalls: 0, runsConceded: 0,
    bestWickets: 0, catches: 0, recentScores: [], recentWickets: [], history: [],
  };
}
