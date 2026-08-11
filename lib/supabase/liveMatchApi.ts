import { getSupabaseClient } from './client';

export interface CloudLiveMatch {
  id: string;
  tournamentId: string;
  tournamentLocalId?: string;
  tournamentName: string;
  format: string;
  status: string;
  venue?: string;
  rules: Record<string, unknown>;
  result?: Record<string, unknown>;
  teamA: { id: string; name: string; shortName: string };
  teamB: { id: string; name: string; shortName: string };
  innings: {
    id: string;
    sequence: number;
    battingTeamId: string;
    target?: number;
    isFollowOn: boolean;
  } | null;
  allInnings: Array<{
    id: string;
    sequence: number;
    battingTeamId: string;
    target?: number;
    isFollowOn: boolean;
    status: string;
    totalRuns: number;
    totalWickets: number;
    totalBalls: number;
  }>;
  score: {
    runs: number;
    wickets: number;
    legalBalls: number;
    latestSequence: number;
    lastEvent?: { kind?: string; payload?: Record<string, unknown> };
    updatedAt?: string;
  };
  commentary: CloudMatchEvent[];
  scorecard: Record<string, unknown>;
  playerNames: Record<string, string>;
  eligibilityReason?: 'OWNER' | 'MY_TEAM' | 'TOURNAMENT_MEMBER' | 'FOLLOWING';
}

export interface CloudMatchSquadPlayer {
  id: string;
  teamId: string;
  name: string;
  role: 'BAT' | 'BOWL' | 'ALL' | 'WK';
  battingOrder: number;
  jerseyNo?: number;
  isCaptain: boolean;
  isKeeper: boolean;
}

export interface CloudHeadToHeadMatch {
  id: string;
  winnerTeamId?: string;
  teamARuns: number;
  teamBRuns: number;
}

export interface CloudMatchContext {
  squads: CloudMatchSquadPlayer[];
  meetings: CloudHeadToHeadMatch[];
  playerOfMatch?: { id: string; name: string; reason: string };
}

export interface LiveMatchCursor { updatedAt: string; id: string }
export interface LiveMatchPage { matches: CloudLiveMatch[]; nextCursor?: LiveMatchCursor; hasMore: boolean }

export interface CloudMatchEvent {
  id: string;
  sequence: number;
  kind: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

interface RawLiveEvent {
  id: string;
  match_id: string;
  sequence: number | string;
  kind: string;
  payload: Record<string, unknown> | null;
  created_at: string;
}

export interface CloudLiveTournament {
  id: string;
  localId?: string;
  name: string;
  location?: string;
  logoUrl?: string;
  matches: CloudLiveMatch[];
}

const LIVE_STATUSES = ['IN_PROGRESS', 'INNINGS_BREAK', 'FOLLOW_ON_DECISION'];
const CHANNEL_COUNTER_KEY = '__wricketLiveMatchChannelCounter';
const globalWithChannelCounter = globalThis as typeof globalThis & {
  [CHANNEL_COUNTER_KEY]?: number;
};
const LIVE_PAGE_SIZE = 8;

export const liveMatchApi = {
  async list(): Promise<CloudLiveMatch[]> {
    return (await this.listPage()).matches;
  },

  async listPage(cursor?: LiveMatchCursor): Promise<LiveMatchPage> {
    const client = getSupabaseClient();
    const { data: pageRows, error: pageError } = await client.rpc('list_eligible_live_matches', {
      p_cursor_updated_at: cursor?.updatedAt ?? null,
      p_cursor_id: cursor?.id ?? null,
      p_limit: LIVE_PAGE_SIZE,
    });
    if (pageError) throw pageError;
    const rows = pageRows ?? [];
    if (rows.length === 0) return { matches: [], hasMore: false };
    const ids = rows.map((row: Record<string, unknown>) => String(row.match_id));
    const { data: matches, error } = await client
      .from('matches')
      .select('id, tournament_id, format, status, team_a_id, team_b_id, venue, rules, result')
      .in('id', ids);
    if (error) throw error;
    const order = new Map<string, number>(ids.map((id: string, index: number) => [id, index]));
    const reason = new Map(rows.map((row: Record<string, unknown>) => [String(row.match_id), String(row.eligibility_reason)]));
    const hydrated = await loadRelated((matches ?? []).sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)), false);
    const withReason = hydrated.map(match => ({ ...match, eligibilityReason: reason.get(match.id) as CloudLiveMatch['eligibilityReason'] }));
    const last = rows[rows.length - 1] as Record<string, unknown>;
    return {
      matches: withReason,
      hasMore: rows.length === LIVE_PAGE_SIZE,
      nextCursor: { updatedAt: String(last.match_updated_at), id: String(last.match_id) },
    };
  },

  async getSummary(matchId: string): Promise<CloudLiveMatch | null> {
    const { data: match, error } = await getSupabaseClient()
      .from('matches')
      .select('id, tournament_id, format, status, team_a_id, team_b_id, venue, rules, result')
      .eq('id', matchId)
      .maybeSingle();
    if (error) throw error;
    if (!match || !LIVE_STATUSES.includes(match.status)) return null;
    return (await loadRelated([match], false))[0] ?? null;
  },

  async listTournaments(): Promise<CloudLiveTournament[]> {
    const matches = await this.list();
    const grouped = new Map<string, CloudLiveTournament>();
    for (const match of matches) {
      const tournament = grouped.get(match.tournamentId) ?? {
        id: match.tournamentId,
        localId: match.tournamentLocalId,
        name: match.tournamentName,
        matches: [],
      };
      tournament.matches.push(match);
      grouped.set(match.tournamentId, tournament);
    }
    return Array.from(grouped.values());
  },

  async get(matchId: string): Promise<CloudLiveMatch | null> {
    const { data: match, error } = await getSupabaseClient()
      .from('matches')
      .select('id, tournament_id, format, status, team_a_id, team_b_id, venue, rules, result')
      .eq('id', matchId)
      .maybeSingle();
    if (error) throw error;
    if (!match) return null;
    return (await loadRelated([match], true))[0] ?? null;
  },

  async getContext(matchId: string): Promise<CloudMatchContext> {
    const client = getSupabaseClient();
    const { data: match, error: matchError } = await client.from('matches')
      .select('id, tournament_id, team_a_id, team_b_id')
      .eq('id', matchId)
      .maybeSingle();
    if (matchError) throw matchError;
    if (!match) return { squads: [], meetings: [] };

    const [{ data: xis, error: xiError }, { data: previous, error: previousError }, { data: award, error: awardError }] = await Promise.all([
      client.from('match_xis')
        .select('team_id, player_id, batting_order, is_captain, is_keeper')
        .eq('match_id', matchId)
        .order('batting_order'),
      client.from('matches')
        .select('id, team_a_id, team_b_id, result, scheduled_at')
        .eq('status', 'COMPLETED')
        .neq('id', matchId)
        .or(`and(team_a_id.eq.${match.team_a_id},team_b_id.eq.${match.team_b_id}),and(team_a_id.eq.${match.team_b_id},team_b_id.eq.${match.team_a_id})`)
        .order('scheduled_at', { ascending: false })
        .limit(20),
      client.from('match_mvp_results')
        .select('player_id, batting_points, bowling_points, fielding_points, players(display_name)')
        .eq('match_id', matchId)
        .eq('is_player_of_match', true)
        .maybeSingle(),
    ]);
    if (xiError) throw xiError;
    if (previousError) throw previousError;
    if (awardError) throw awardError;

    const playerIds = (xis ?? []).map(item => item.player_id);
    const previousIds = (previous ?? []).map(item => item.id);
    const [{ data: players, error: playerError }, { data: memberships, error: membershipError }, { data: innings, error: inningsError }] = await Promise.all([
      playerIds.length
        ? client.from('players').select('id, display_name, role').in('id', playerIds)
        : Promise.resolve({ data: [], error: null }),
      playerIds.length
        ? client.from('team_players').select('team_id, player_id, jersey_no').in('team_id', [match.team_a_id, match.team_b_id]).in('player_id', playerIds)
        : Promise.resolve({ data: [], error: null }),
      previousIds.length
        ? client.from('match_innings').select('match_id, batting_team_id, total_runs').in('match_id', previousIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (playerError) throw playerError;
    if (membershipError) throw membershipError;
    if (inningsError) throw inningsError;

    const playerById = new Map((players ?? []).map(player => [player.id, player]));
    const jerseyByPlayer = new Map((memberships ?? []).map(item => [`${item.team_id}:${item.player_id}`, item.jersey_no]));
    const squads = (xis ?? []).map(item => {
      const player = playerById.get(item.player_id);
      return {
        id: item.player_id,
        teamId: item.team_id,
        name: player?.display_name ?? 'Unknown player',
        role: normalizeSquadRole(player?.role),
        battingOrder: Number(item.batting_order),
        jerseyNo: jerseyByPlayer.get(`${item.team_id}:${item.player_id}`) ?? undefined,
        isCaptain: Boolean(item.is_captain),
        isKeeper: Boolean(item.is_keeper),
      } satisfies CloudMatchSquadPlayer;
    });
    const meetings = (previous ?? []).map(item => {
      const totals = (innings ?? []).filter(row => row.match_id === item.id);
      const totalFor = (teamId: string) => totals
        .filter(row => row.batting_team_id === teamId)
        .reduce((sum, row) => sum + Number(row.total_runs ?? 0), 0);
      return {
        id: item.id,
        winnerTeamId: resultWinnerId(item.result),
        teamARuns: totalFor(match.team_a_id),
        teamBRuns: totalFor(match.team_b_id),
      } satisfies CloudHeadToHeadMatch;
    });
    const awardPlayer = relationOne<{ display_name?: string }>((award as any)?.players);
    const dimensions = award ? [
      { label: 'batting impact', value: Number(award.batting_points ?? 0) },
      { label: 'bowling impact', value: Number(award.bowling_points ?? 0) },
      { label: 'fielding impact', value: Number(award.fielding_points ?? 0) },
    ].sort((a, b) => b.value - a.value) : [];
    return {
      squads,
      meetings,
      playerOfMatch: award ? {
        id: award.player_id,
        name: awardPlayer?.display_name ?? 'Player of the Match',
        reason: `Led the match for ${dimensions[0]?.label ?? 'overall impact'}.`,
      } : undefined,
    };
  },

  subscribe(matchId: string, onChange: () => void, onError?: (message: string) => void) {
    const client = getSupabaseClient();
    const instance = (globalWithChannelCounter[CHANNEL_COUNTER_KEY] ?? 0) + 1;
    globalWithChannelCounter[CHANNEL_COUNTER_KEY] = instance;
    const channel = client
      .channel(`live-match:${matchId}:${instance}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'match_snapshots',
        filter: `match_id=eq.${matchId}`,
      }, onChange)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'matches',
        filter: `id=eq.${matchId}`,
      }, onChange)
      .subscribe((status, error) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          onError?.(error?.message ?? 'Live updates are temporarily unavailable');
        }
      });
    return () => {
      void client.removeChannel(channel);
    };
  },

  subscribeList(onChange: () => void) {
    const client = getSupabaseClient();
    const instance = (globalWithChannelCounter[CHANNEL_COUNTER_KEY] ?? 0) + 1;
    globalWithChannelCounter[CHANNEL_COUNTER_KEY] = instance;
    const channel = client
      .channel(`live-match-list:${instance}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'matches',
      }, onChange)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'match_snapshots',
      }, onChange)
      .subscribe();
    return () => {
      void client.removeChannel(channel);
    };
  },

  subscribeLoaded(matchIds: string[], onChange: (matchId: string) => void) {
    if (matchIds.length === 0) return () => undefined;
    const client = getSupabaseClient();
    const instance = (globalWithChannelCounter[CHANNEL_COUNTER_KEY] ?? 0) + 1;
    globalWithChannelCounter[CHANNEL_COUNTER_KEY] = instance;
    const filterIds = matchIds.slice(0, 100).join(',');
    const channel = client.channel(`loaded-live-matches:${instance}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'match_snapshots', filter: `match_id=in.(${filterIds})`,
      }, payload => {
        const matchId = String((payload.new as Record<string, unknown>)?.match_id ?? '');
        if (matchId) onChange(matchId);
      })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'matches', filter: `id=in.(${filterIds})`,
      }, payload => {
        const matchId = String((payload.new as Record<string, unknown>)?.id ?? '');
        if (matchId) onChange(matchId);
      })
      .subscribe();
    return () => { void client.removeChannel(channel); };
  },
};

function normalizeSquadRole(value: unknown): CloudMatchSquadPlayer['role'] {
  if (value === 'BAT' || value === 'BOWL' || value === 'WK') return value;
  return 'ALL';
}

function resultWinnerId(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const result = value as Record<string, unknown>;
  const id = result.winnerTeamId ?? result.winner_team_id;
  return typeof id === 'string' ? id : undefined;
}

function relationOne<T>(value: T | T[] | null | undefined): T | undefined {
  return Array.isArray(value) ? value[0] : value ?? undefined;
}

async function loadRelated(matches: any[], detailed: boolean): Promise<CloudLiveMatch[]> {
  if (matches.length === 0) return [];
  const matchIds = matches.map(match => match.id);
  const teamIds = Array.from(new Set(matches.flatMap(match => [
    match.team_a_id,
    match.team_b_id,
  ])));
  const tournamentIds = Array.from(new Set(matches.map(match => match.tournament_id)));
  const client = getSupabaseClient();
  const [
    { data: teams, error: teamsError },
    { data: innings, error: inningsError },
    { data: snapshots, error: snapshotsError },
    { data: tournaments, error: tournamentsError },
    eventsResult,
  ] = await Promise.all([
    client.from('teams').select('id, name, short_name').in('id', teamIds),
    client.from('match_innings')
      .select('id, match_id, sequence, batting_team_id, target, is_follow_on, status, total_runs, total_wickets, total_balls')
      .in('match_id', matchIds)
      .order('sequence'),
    client.from('match_snapshots')
      .select('match_id, latest_sequence, scoreboard, scorecard, updated_at')
      .in('match_id', matchIds),
    client.from('tournaments')
      .select('id, source_local_id, name, location, logo_url')
      .in('id', tournamentIds),
    detailed
      ? loadAllMatchEvents(matchIds)
      : loadRecentMatchEvents(matchIds),
  ]);
  if (teamsError) throw teamsError;
  if (inningsError) throw inningsError;
  if (snapshotsError) throw snapshotsError;
  if (tournamentsError) throw tournamentsError;
  if (eventsResult.error) throw eventsResult.error;
  const eventRows = (eventsResult.data ?? []) as RawLiveEvent[];
  const playerIds = detailed
    ? Array.from(new Set(eventRows.flatMap(event => {
        const payload = event.payload ?? {};
        return [
          'striker_id',
          'non_striker_id',
          'bowler_id',
          'out_player_id',
          'fielder_id',
          'assistant_fielder_id',
        ]
          .map(key => payload[key])
          .filter((value): value is string => typeof value === 'string');
      })))
    : [];
  const { data: players, error: playersError } = playerIds.length
    ? await client.from('players').select('id, display_name').in('id', playerIds)
    : { data: [], error: null };
  if (playersError) throw playersError;
  const playerNames = Object.fromEntries((players ?? []).map(player => [player.id, player.display_name]));

  const teamMap = new Map(teams.map(team => [team.id, team]));
  const inningsByMatch = new Map<string, typeof innings>();
  for (const item of innings) {
    const current = inningsByMatch.get(item.match_id) ?? [];
    current.push(item);
    inningsByMatch.set(item.match_id, current);
  }
  const snapshotMap = new Map(snapshots.map(snapshot => [snapshot.match_id, snapshot]));
  const tournamentMap = new Map(tournaments.map(tournament => [tournament.id, tournament]));

  return matches.flatMap(match => {
    const teamA = teamMap.get(match.team_a_id);
    const teamB = teamMap.get(match.team_b_id);
    if (!teamA || !teamB) return [];
    const matchInnings = inningsByMatch.get(match.id) ?? [];
    const currentInnings = matchInnings.find(item => item.status === 'IN_PROGRESS')
      ?? matchInnings[matchInnings.length - 1];
    const snapshot = snapshotMap.get(match.id);
    const tournament = tournamentMap.get(match.tournament_id);
    if (!tournament) return [];
    const scoreboard = snapshot?.scoreboard ?? {};
    return [{
      id: match.id,
      tournamentId: tournament.id,
      tournamentLocalId: tournament.source_local_id ?? undefined,
      tournamentName: tournament.name,
      format: match.format,
      status: match.status,
      venue: match.venue ?? tournament.location ?? undefined,
      rules: match.rules ?? {},
      result: match.result ?? undefined,
      teamA: { id: teamA.id, name: teamA.name, shortName: teamA.short_name },
      teamB: { id: teamB.id, name: teamB.name, shortName: teamB.short_name },
      innings: currentInnings ? {
        id: currentInnings.id,
        sequence: currentInnings.sequence,
        battingTeamId: currentInnings.batting_team_id,
        target: currentInnings.target ?? undefined,
        isFollowOn: Boolean(currentInnings.is_follow_on),
      } : null,
      allInnings: matchInnings.map(item => ({
        id: item.id,
        sequence: item.sequence,
        battingTeamId: item.batting_team_id,
        target: item.target ?? undefined,
        isFollowOn: Boolean(item.is_follow_on),
        status: item.status,
        totalRuns: Number(item.total_runs ?? 0),
        totalWickets: Number(item.total_wickets ?? 0),
        totalBalls: Number(item.total_balls ?? 0),
      })),
      score: {
        runs: Number(scoreboard.total_runs ?? 0),
        wickets: Number(scoreboard.total_wickets ?? 0),
        legalBalls: Number(scoreboard.legal_balls ?? 0),
        latestSequence: Number(snapshot?.latest_sequence ?? 0),
        lastEvent: scoreboard.last_event,
        updatedAt: snapshot?.updated_at,
      },
      commentary: eventRows
        .filter(event => event.match_id === match.id)
        .map(event => ({
          id: event.id,
          sequence: Number(event.sequence),
          kind: event.kind,
          payload: event.payload ?? {},
          createdAt: event.created_at,
        })),
      scorecard: snapshot?.scorecard ?? {},
      playerNames,
    } satisfies CloudLiveMatch];
  });
}

async function loadAllMatchEvents(matchIds: string[]) {
  const client = getSupabaseClient();
  const events: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await client.from('match_events')
      .select('id, match_id, sequence, kind, payload, created_at')
      .in('match_id', matchIds)
      .order('sequence', { ascending: false })
      .range(from, from + 999);
    if (error) return { data: null, error };
    events.push(...data);
    if (data.length < 1000) return { data: events, error: null };
  }
}

async function loadRecentMatchEvents(matchIds: string[]) {
  return getSupabaseClient().rpc('list_recent_live_events', { p_match_ids: matchIds });
}
