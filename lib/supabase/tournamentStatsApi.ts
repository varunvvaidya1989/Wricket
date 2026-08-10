import { getSupabaseClient } from './client';

export interface TournamentPlayerStat {
  id: string;
  name: string;
  runs: number;
  wickets: number;
  matches: number;
  innings: number;
  ballsFaced: number;
  dismissals: number;
  bowlingBalls: number;
  runsConceded: number;
  catches: number;
  stumpings: number;
  recentScores: number[];
  recentWickets: number[];
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
    const events: Array<{ match_id: string; kind: string; payload: Record<string, unknown> | null }> = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await client.from('match_events')
        .select('match_id, kind, payload')
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
      const next: TournamentPlayerStat = {
        id, name: names.get(id) ?? 'Unknown player', runs: 0, wickets: 0, matches: 0, innings: 0,
        ballsFaced: 0, dismissals: 0, bowlingBalls: 0, runsConceded: 0, catches: 0, stumpings: 0,
        recentScores: [], recentWickets: [],
      };
      players.set(id, next);
      return next;
    };
    let balls = 0;
    let runs = 0;
    let wickets = 0;
    const perMatch = new Map<string, Map<string, { runs: number; wickets: number; batted: boolean; bowled: boolean }>>();
    for (const event of events) {
      if (event.kind !== 'BALL_RECORDED') continue;
      const payload = event.payload ?? {};
      balls += 1;
      runs += Number(payload.runs_bat ?? 0) + Number(payload.runs_extra ?? 0);
      const strikerId = payload.striker_id;
      const matchId = event.match_id;
      const matchPlayer = (id: string) => {
        const byPlayer = perMatch.get(matchId) ?? new Map();
        perMatch.set(matchId, byPlayer);
        const row = byPlayer.get(id) ?? { runs: 0, wickets: 0, batted: false, bowled: false };
        byPlayer.set(id, row);
        return row;
      };
      if (typeof strikerId === 'string') {
        const current = player(strikerId);
        const batRuns = Number(payload.runs_bat ?? 0);
        current.runs += batRuns;
        if (payload.extra_kind !== 'WIDE') current.ballsFaced += 1;
        const form = matchPlayer(strikerId); form.runs += batRuns; form.batted = true;
      }
      const bowlerId = payload.bowler_id;
      if (typeof bowlerId === 'string') {
        const current = player(bowlerId);
        if (payload.is_legal) current.bowlingBalls += 1;
        current.runsConceded += Number(payload.runs_bat ?? 0) +
          (['BYE', 'LEG_BYE'].includes(String(payload.extra_kind ?? '')) ? 0 : Number(payload.runs_extra ?? 0));
        matchPlayer(bowlerId).bowled = true;
      }
      if (payload.is_wicket) {
        wickets += 1;
        const dismissal = String(payload.dismissal_kind ?? '');
        const outId = payload.out_player_id;
        if (typeof outId === 'string') player(outId).dismissals += 1;
        const fielderId = payload.fielder_id;
        if (typeof fielderId === 'string' && dismissal === 'CAUGHT') player(fielderId).catches += 1;
        if (typeof fielderId === 'string' && dismissal === 'STUMPED') player(fielderId).stumpings += 1;
        if (
          typeof bowlerId === 'string' &&
          ['BOWLED', 'CAUGHT', 'LBW', 'STUMPED', 'HIT_WICKET'].includes(dismissal)
        ) {
          player(bowlerId).wickets += 1;
          matchPlayer(bowlerId).wickets += 1;
        }
      }
    }

    for (const [playerId, current] of players) {
      const form = [...perMatch.values()].flatMap(byPlayer => byPlayer.get(playerId) ? [byPlayer.get(playerId)!] : []);
      current.matches = form.length;
      current.innings = form.filter(row => row.batted).length;
      current.recentScores = form.filter(row => row.batted).map(row => row.runs).slice(-5).reverse();
      current.recentWickets = form.filter(row => row.bowled).map(row => row.wickets).slice(-5).reverse();
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
