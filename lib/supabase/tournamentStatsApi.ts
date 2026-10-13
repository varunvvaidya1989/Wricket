import { readIdChunks, readPages } from './readPages';
import { getSupabaseClient } from './client';
import { activeStatisticsBalls, eligibleCompletedMatch, type StatisticsMatch, type StatisticsEvent } from '@/lib/wricket/presentation/completedStatistics';

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
    const matches = await readPages((start, end) => client.from('matches')
      .select('id, status, result, scheduled_at, created_at')
      .eq('tournament_id', tournamentId).order('id').range(start, end));
    if (!matches.length) return emptyStats();

    const completed = matches.filter(eligibleCompletedMatch);
    const matchIds = completed.map(match => match.id);
    if (!matchIds.length) return { ...emptyStats(), matches: matches.length };
    const events: StatisticsEvent[] = await readIdChunks(matchIds, chunk => readPages((start, end) => client.from('match_events')
      .select('id, client_event_id, match_id, sequence, kind, payload')
      .in('match_id', chunk).order('match_id').order('sequence').order('id').range(start, end)));

    const playerIds = new Set<string>();
    for (const event of activeStatisticsBalls(events)) {
      if (event.kind !== 'BALL_RECORDED') continue;
      const payload = event.payload ?? {};
      for (const key of ['striker_id', 'bowler_id', 'out_player_id', 'fielder_id']) {
        const id = payload[key];
        if (typeof id === 'string') playerIds.add(id);
      }
    }
    const names = new Map<string, string>();
    const ids = [...playerIds];
    for (let from = 0; from < ids.length; from += 100) {
      const { data, error } = await client.from('players')
        .select('id, display_name')
        .in('id', ids.slice(from, from + 100));
      if (error) throw error;
      data.forEach(player => names.set(player.id, player.display_name));
    }

    return aggregateTournamentStatistics(matches, events, names);
  },
};

export function aggregateTournamentStatistics(matches: readonly StatisticsMatch[], events: readonly StatisticsEvent[], names: ReadonlyMap<string, string>): TournamentCloudStats {
    const completed = matches.filter(eligibleCompletedMatch);
    const eligibleIds = new Set(completed.map(match => match.id));
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
    const battingInnings = new Map<string, Set<string>>();
    const perMatch = new Map<string, Map<string, { runs: number; wickets: number; batted: boolean; bowled: boolean }>>();
    for (const event of activeStatisticsBalls(events).filter(event => eligibleIds.has(event.match_id))) {
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
        const innings = battingInnings.get(strikerId) ?? new Set<string>();
        innings.add(`${event.match_id}:${String(payload.innings_id ?? '')}`);
        battingInnings.set(strikerId, innings);
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
      const form = [...perMatch.entries()].sort(([a], [b]) => {
        const date = (id: string) => { const match = completed.find(item => item.id === id); return Date.parse(match?.scheduled_at ?? match?.created_at ?? ''); };
        return date(a) - date(b) || a.localeCompare(b);
      }).map(([, byPlayer]) => byPlayer).flatMap(byPlayer => byPlayer.get(playerId) ? [byPlayer.get(playerId)!] : []);
      current.matches = form.length;
      current.innings = battingInnings.get(playerId)?.size ?? 0;
      current.recentScores = form.filter(row => row.batted).map(row => row.runs).slice(-5).reverse();
      current.recentWickets = form.filter(row => row.bowled).map(row => row.wickets).slice(-5).reverse();
    }

    return {
      matches: matches.length,
      completedMatches: completed.length,
      balls,
      runs,
      wickets,
      players: [...players.values()],
    };
}

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
