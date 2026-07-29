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
  } | null;
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
}

export interface CloudMatchEvent {
  id: string;
  sequence: number;
  kind: string;
  payload: Record<string, unknown>;
  createdAt: string;
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

export const liveMatchApi = {
  async list(): Promise<CloudLiveMatch[]> {
    const { data: matches, error } = await getSupabaseClient()
      .from('matches')
      .select('id, tournament_id, format, status, team_a_id, team_b_id, venue, rules, result')
      .in('status', LIVE_STATUSES)
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return loadRelated(matches, false);
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
};

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
      .select('id, match_id, sequence, batting_team_id, target, status')
      .in('match_id', matchIds)
      .eq('status', 'IN_PROGRESS'),
    client.from('match_snapshots')
      .select('match_id, latest_sequence, scoreboard, scorecard, updated_at')
      .in('match_id', matchIds),
    client.from('tournaments')
      .select('id, source_local_id, name, location, logo_url')
      .in('id', tournamentIds),
    detailed
      ? client.from('match_events')
          .select('id, match_id, sequence, kind, payload, created_at')
          .in('match_id', matchIds)
          .order('sequence', { ascending: false })
          .limit(500)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (teamsError) throw teamsError;
  if (inningsError) throw inningsError;
  if (snapshotsError) throw snapshotsError;
  if (tournamentsError) throw tournamentsError;
  if (eventsResult.error) throw eventsResult.error;
  const playerIds = detailed
    ? Array.from(new Set((eventsResult.data ?? []).flatMap(event => {
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
  const inningsMap = new Map(innings.map(item => [item.match_id, item]));
  const snapshotMap = new Map(snapshots.map(snapshot => [snapshot.match_id, snapshot]));
  const tournamentMap = new Map(tournaments.map(tournament => [tournament.id, tournament]));

  return matches.flatMap(match => {
    const teamA = teamMap.get(match.team_a_id);
    const teamB = teamMap.get(match.team_b_id);
    if (!teamA || !teamB) return [];
    const currentInnings = inningsMap.get(match.id);
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
      } : null,
      score: {
        runs: Number(scoreboard.total_runs ?? 0),
        wickets: Number(scoreboard.total_wickets ?? 0),
        legalBalls: Number(scoreboard.legal_balls ?? 0),
        latestSequence: Number(snapshot?.latest_sequence ?? 0),
        lastEvent: scoreboard.last_event,
        updatedAt: snapshot?.updated_at,
      },
      commentary: (eventsResult.data ?? [])
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
