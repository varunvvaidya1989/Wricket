import { getSupabaseClient } from './client';

export type TeamMatchOutcome = 'W' | 'L' | 'T' | 'D' | 'NR';

export interface TeamMatchHistoryItem {
  id: string;
  opponentTeamId: string;
  opponentName: string;
  opponentShortName: string;
  tournamentName?: string;
  format: string;
  playedAt: string;
  outcome: TeamMatchOutcome;
  runsFor: number;
  runsAgainst: number;
}

export interface TeamHeadToHeadItem {
  opponentTeamId: string;
  opponentName: string;
  opponentShortName: string;
  played: number;
  won: number;
  lost: number;
  tied: number;
  noResult: number;
  lastPlayedAt: string;
}

export interface TeamInsights {
  stats: {
    played: number;
    won: number;
    lost: number;
    tied: number;
    noResult: number;
    winRate: number;
    runsFor: number;
    runsAgainst: number;
    highestScore: number;
  };
  history: TeamMatchHistoryItem[];
  headToHead: TeamHeadToHeadItem[];
}

interface TeamRow {
  id: string;
  name: string;
  short_name: string;
  source_team_id: string | null;
}

interface MatchRow {
  id: string;
  team_a_id: string;
  team_b_id: string;
  format: string;
  status: string;
  result: Record<string, unknown> | null;
  scheduled_at: string | null;
  created_at: string;
  tournaments: { name?: string } | { name?: string }[] | null;
}

interface InningsRow {
  match_id: string;
  batting_team_id: string;
  total_runs: number;
}

export const teamInsightsApi = {
  async get(teamId: string): Promise<TeamInsights> {
    const client = getSupabaseClient();
    const { data: selected, error: selectedError } = await client.from('teams')
      .select('id, name, short_name, source_team_id')
      .eq('id', teamId)
      .single();
    if (selectedError) throw selectedError;

    const canonicalId = selected.source_team_id ?? selected.id;
    const { data: family, error: familyError } = await client.from('teams')
      .select('id, name, short_name, source_team_id')
      .or(`id.eq.${canonicalId},source_team_id.eq.${canonicalId}`);
    if (familyError) throw familyError;
    const familyIds = (family ?? []).map(team => team.id);
    if (familyIds.length === 0) return emptyTeamInsights();

    const familyFilter = familyIds.join(',');
    const { data: matches, error: matchError } = await client.from('matches')
      .select('id, team_a_id, team_b_id, format, status, result, scheduled_at, created_at, tournaments(name)')
      .or(`team_a_id.in.(${familyFilter}),team_b_id.in.(${familyFilter})`)
      .in('status', ['COMPLETED', 'ABANDONED'])
      .order('scheduled_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false });
    if (matchError) throw matchError;
    if (!matches?.length) return emptyTeamInsights();

    const matchRows = matches as MatchRow[];
    const matchIds = matchRows.map(match => match.id);
    const directOpponentIds = Array.from(new Set(matchRows.map(match =>
      familyIds.includes(match.team_a_id) ? match.team_b_id : match.team_a_id,
    )));
    const [{ data: innings, error: inningsError }, { data: opponents, error: opponentError }] = await Promise.all([
      client.from('match_innings')
        .select('match_id, batting_team_id, total_runs')
        .in('match_id', matchIds),
      client.from('teams')
        .select('id, name, short_name, source_team_id')
        .in('id', directOpponentIds),
    ]);
    if (inningsError) throw inningsError;
    if (opponentError) throw opponentError;

    const opponentRows = (opponents ?? []) as TeamRow[];
    const missingCanonicalIds = Array.from(new Set(opponentRows
      .map(team => team.source_team_id)
      .filter((id): id is string => Boolean(id))))
      .filter(id => !opponentRows.some(team => team.id === id));
    let canonicalOpponents: TeamRow[] = [];
    if (missingCanonicalIds.length > 0) {
      const { data, error } = await client.from('teams')
        .select('id, name, short_name, source_team_id')
        .in('id', missingCanonicalIds);
      if (error) throw error;
      canonicalOpponents = (data ?? []) as TeamRow[];
    }

    return buildTeamInsights({
      familyIds,
      matches: matchRows,
      innings: (innings ?? []) as InningsRow[],
      teams: [...opponentRows, ...canonicalOpponents],
    });
  },
};

export function buildTeamInsights(input: {
  familyIds: string[];
  matches: MatchRow[];
  innings: InningsRow[];
  teams: TeamRow[];
}): TeamInsights {
  const familyIds = new Set(input.familyIds);
  const teamById = new Map(input.teams.map(team => [team.id, team]));
  const inningsByMatch = new Map<string, InningsRow[]>();
  for (const innings of input.innings) {
    const rows = inningsByMatch.get(innings.match_id) ?? [];
    rows.push(innings);
    inningsByMatch.set(innings.match_id, rows);
  }

  const history = input.matches.map(match => {
    const opponentId = familyIds.has(match.team_a_id) ? match.team_b_id : match.team_a_id;
    const directOpponent = teamById.get(opponentId);
    const canonicalOpponentId = directOpponent?.source_team_id ?? opponentId;
    const opponent = teamById.get(canonicalOpponentId) ?? directOpponent;
    const matchInnings = inningsByMatch.get(match.id) ?? [];
    const runsFor = matchInnings
      .filter(innings => familyIds.has(innings.batting_team_id))
      .reduce((total, innings) => total + Number(innings.total_runs ?? 0), 0);
    const runsAgainst = matchInnings
      .filter(innings => !familyIds.has(innings.batting_team_id))
      .reduce((total, innings) => total + Number(innings.total_runs ?? 0), 0);
    const tournament = Array.isArray(match.tournaments) ? match.tournaments[0] : match.tournaments;
    return {
      id: match.id,
      opponentTeamId: canonicalOpponentId,
      opponentName: opponent?.name ?? directOpponent?.name ?? 'Opponent',
      opponentShortName: opponent?.short_name ?? directOpponent?.short_name ?? 'OPP',
      tournamentName: tournament?.name,
      format: match.format,
      playedAt: match.scheduled_at ?? match.created_at,
      outcome: outcomeForMatch(match, familyIds),
      runsFor,
      runsAgainst,
    } satisfies TeamMatchHistoryItem;
  });

  const headToHead = new Map<string, TeamHeadToHeadItem>();
  for (const match of history) {
    const existing = headToHead.get(match.opponentTeamId) ?? {
      opponentTeamId: match.opponentTeamId,
      opponentName: match.opponentName,
      opponentShortName: match.opponentShortName,
      played: 0,
      won: 0,
      lost: 0,
      tied: 0,
      noResult: 0,
      lastPlayedAt: match.playedAt,
    };
    existing.played += 1;
    if (match.outcome === 'W') existing.won += 1;
    else if (match.outcome === 'L') existing.lost += 1;
    else if (match.outcome === 'T' || match.outcome === 'D') existing.tied += 1;
    else existing.noResult += 1;
    if (Date.parse(match.playedAt) > Date.parse(existing.lastPlayedAt)) existing.lastPlayedAt = match.playedAt;
    headToHead.set(match.opponentTeamId, existing);
  }

  const won = history.filter(match => match.outcome === 'W').length;
  const lost = history.filter(match => match.outcome === 'L').length;
  const tied = history.filter(match => match.outcome === 'T' || match.outcome === 'D').length;
  const noResult = history.filter(match => match.outcome === 'NR').length;
  const inningsScores = input.innings
    .filter(innings => familyIds.has(innings.batting_team_id))
    .map(innings => Number(innings.total_runs ?? 0));
  return {
    stats: {
      played: history.length,
      won,
      lost,
      tied,
      noResult,
      winRate: history.length ? won / history.length * 100 : 0,
      runsFor: history.reduce((total, match) => total + match.runsFor, 0),
      runsAgainst: history.reduce((total, match) => total + match.runsAgainst, 0),
      highestScore: inningsScores.length ? Math.max(...inningsScores) : 0,
    },
    history,
    headToHead: [...headToHead.values()].sort((a, b) =>
      b.played - a.played || Date.parse(b.lastPlayedAt) - Date.parse(a.lastPlayedAt),
    ),
  };
}

function outcomeForMatch(match: MatchRow, familyIds: Set<string>): TeamMatchOutcome {
  const kind = String(match.result?.kind ?? 'NO_RESULT');
  if (kind === 'TIE') return 'T';
  if (kind === 'DRAW') return 'D';
  if (kind === 'NO_RESULT' || kind === 'CANCELLED' || match.status === 'ABANDONED') return 'NR';
  const winner = match.result?.winnerTeamId ?? match.result?.winner_team_id;
  return typeof winner === 'string' && familyIds.has(winner) ? 'W' : typeof winner === 'string' ? 'L' : 'NR';
}

function emptyTeamInsights(): TeamInsights {
  return {
    stats: {
      played: 0,
      won: 0,
      lost: 0,
      tied: 0,
      noResult: 0,
      winRate: 0,
      runsFor: 0,
      runsAgainst: 0,
      highestScore: 0,
    },
    history: [],
    headToHead: [],
  };
}
