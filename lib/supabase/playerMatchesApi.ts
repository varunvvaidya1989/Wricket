import { getSupabaseClient } from './client';
import { personalStatsApi } from './personalStatsApi';
import { comparePlayerMatches } from '@/lib/wricket/player-matches';
import type { PlayerMatchItem } from '@/lib/wricket/player-matches';

export { comparePlayerMatches, playerMatchCategory } from '@/lib/wricket/player-matches';
export type { PlayerMatchFilter, PlayerMatchItem } from '@/lib/wricket/player-matches';

export const playerMatchesApi = {
  async listMine(accountId: string): Promise<PlayerMatchItem[]> {
    const client = getSupabaseClient();
    const [{ data: links, error: linkError }, { data: players, error: playerError }] = await Promise.all([
      client.from('player_account_links').select('player_id').eq('account_id', accountId),
      client.from('players').select('id').eq('profile_id', accountId),
    ]);
    if (linkError && !['PGRST205', '42P01'].includes(linkError.code ?? '')) throw linkError;
    if (playerError) throw playerError;
    const playerIds = Array.from(new Set([
      ...(links ?? []).map(row => row.player_id),
      ...(players ?? []).map(row => row.id),
    ]));
    if (!playerIds.length) return [];

    const { data: xis, error: xiError } = await client.from('match_xis')
      .select('match_id, team_id, player_id')
      .in('player_id', playerIds);
    if (xiError) throw xiError;
    const matchIds = Array.from(new Set((xis ?? []).map(row => row.match_id)));
    if (!matchIds.length) return [];

    const [{ data: matches, error: matchError }, performance] = await Promise.all([
      client.from('matches')
        .select('id, tournament_id, team_a_id, team_b_id, format, status, scheduled_at, created_at, result')
        .in('id', matchIds),
      personalStatsApi.getForPlayerIds(playerIds).catch(() => undefined),
    ]);
    if (matchError) throw matchError;
    const matchRows = matches ?? [];
    const teamIds = Array.from(new Set(matchRows.flatMap(match => [match.team_a_id, match.team_b_id])));
    const tournamentIds = Array.from(new Set(matchRows.flatMap(match => match.tournament_id ? [match.tournament_id] : [])));
    const [{ data: teams, error: teamError }, tournamentResult, { data: innings, error: inningsError }] = await Promise.all([
      client.from('teams').select('id, name').in('id', teamIds),
      tournamentIds.length
        ? client.from('tournaments').select('id, name').in('id', tournamentIds)
        : Promise.resolve({ data: [], error: null }),
      client.from('match_innings')
        .select('match_id, batting_team_id, total_runs, total_wickets')
        .in('match_id', matchIds),
    ]);
    if (teamError) throw teamError;
    if (tournamentResult.error) throw tournamentResult.error;
    if (inningsError) throw inningsError;

    const playerIdSet = new Set(playerIds);
    const ownTeamByMatch = new Map<string, string>();
    (xis ?? []).forEach(row => {
      if (playerIdSet.has(row.player_id)) ownTeamByMatch.set(row.match_id, row.team_id);
    });
    const teamNames = new Map((teams ?? []).map(team => [team.id, team.name]));
    const tournamentNames = new Map((tournamentResult.data ?? []).map(tournament => [tournament.id, tournament.name]));
    const history = new Map((performance?.history ?? []).map(entry => [entry.matchId, entry]));
    const inningsByMatch = new Map<string, { batting_team_id: string; total_runs: number; total_wickets: number }[]>();
    (innings ?? []).forEach(row => {
      const current = inningsByMatch.get(row.match_id) ?? [];
      current.push(row);
      inningsByMatch.set(row.match_id, current);
    });

    return matchRows.map(match => {
      const ownTeamId = ownTeamByMatch.get(match.id);
      const opponentId = ownTeamId === match.team_a_id ? match.team_b_id : match.team_a_id;
      const contribution = history.get(match.id);
      const matchInnings = inningsByMatch.get(match.id) ?? [];
      return {
        id: match.id,
        status: match.status,
        format: match.format,
        scheduledAt: String(match.scheduled_at ?? match.created_at),
        tournamentName: tournamentNames.get(match.tournament_id) ?? 'Independent match',
        ownTeamName: teamNames.get(ownTeamId) ?? 'My team',
        opponentName: teamNames.get(opponentId) ?? 'Opponent',
        ownScore: scoreForTeam(matchInnings, ownTeamId),
        opponentScore: scoreForTeam(matchInnings, opponentId),
        result: contribution?.result,
        runs: contribution?.runs,
        balls: contribution?.balls,
        wickets: contribution?.wickets,
      } satisfies PlayerMatchItem;
    }).sort(comparePlayerMatches);
  },
};

function scoreForTeam(
  innings: { batting_team_id: string; total_runs: number; total_wickets: number }[],
  teamId?: string,
): string | undefined {
  if (!teamId) return undefined;
  const rows = innings.filter(row => row.batting_team_id === teamId);
  if (!rows.length) return undefined;
  return rows.map(row => `${row.total_runs}/${row.total_wickets}`).join(' & ');
}
