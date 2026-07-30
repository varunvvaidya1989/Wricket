import { getSupabaseClient } from './client';

export interface TournamentPlayerStat {
  id: string;
  name: string;
  runs: number;
  wickets: number;
}

export interface TournamentCloudStats {
  matches: number;
  completedMatches: number;
  balls: number;
  runs: number;
  wickets: number;
  players: TournamentPlayerStat[];
}

export const tournamentStatsApi = {
  async get(tournamentId: string): Promise<TournamentCloudStats> {
    const client = getSupabaseClient();
    const { data: matches, error: matchError } = await client.from('matches')
      .select('id, status')
      .eq('tournament_id', tournamentId);
    if (matchError) throw matchError;
    if (!matches.length) return emptyStats();

    const matchIds = matches.map(match => match.id);
    const events: Array<{ kind: string; payload: Record<string, unknown> | null }> = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await client.from('match_events')
        .select('kind, payload')
        .in('match_id', matchIds)
        .order('sequence')
        .range(from, from + 999);
      if (error) throw error;
      events.push(...data);
      if (data.length < 1000) break;
    }

    const playerIds = new Set<string>();
    for (const event of events) {
      if (event.kind !== 'BALL_RECORDED') continue;
      const payload = event.payload ?? {};
      for (const key of ['striker_id', 'bowler_id']) {
        const id = payload[key];
        if (typeof id === 'string') playerIds.add(id);
      }
    }
    const names = new Map<string, string>();
    const ids = [...playerIds];
    for (let from = 0; from < ids.length; from += 500) {
      const { data, error } = await client.from('players')
        .select('id, display_name')
        .in('id', ids.slice(from, from + 500));
      if (error) throw error;
      data.forEach(player => names.set(player.id, player.display_name));
    }

    const players = new Map<string, TournamentPlayerStat>();
    const player = (id: string) => {
      const existing = players.get(id);
      if (existing) return existing;
      const next = { id, name: names.get(id) ?? 'Unknown player', runs: 0, wickets: 0 };
      players.set(id, next);
      return next;
    };
    let balls = 0;
    let runs = 0;
    let wickets = 0;
    for (const event of events) {
      if (event.kind !== 'BALL_RECORDED') continue;
      const payload = event.payload ?? {};
      balls += 1;
      runs += Number(payload.runs_bat ?? 0) + Number(payload.runs_extra ?? 0);
      const strikerId = payload.striker_id;
      if (typeof strikerId === 'string') player(strikerId).runs += Number(payload.runs_bat ?? 0);
      if (payload.is_wicket) {
        wickets += 1;
        const bowlerId = payload.bowler_id;
        const dismissal = String(payload.dismissal_kind ?? '');
        if (
          typeof bowlerId === 'string' &&
          ['BOWLED', 'CAUGHT', 'LBW', 'STUMPED', 'HIT_WICKET'].includes(dismissal)
        ) {
          player(bowlerId).wickets += 1;
        }
      }
    }

    return {
      matches: matches.length,
      completedMatches: matches.filter(match => match.status === 'COMPLETED').length,
      balls,
      runs,
      wickets,
      players: [...players.values()],
    };
  },
};

function emptyStats(): TournamentCloudStats {
  return {
    matches: 0,
    completedMatches: 0,
    balls: 0,
    runs: 0,
    wickets: 0,
    players: [],
  };
}
