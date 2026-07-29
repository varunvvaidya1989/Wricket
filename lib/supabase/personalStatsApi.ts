import { getSupabaseClient } from './client';

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
}

export const personalStatsApi = {
  async get(userId: string, displayName?: string): Promise<PersonalStats> {
    const client = getSupabaseClient();
    let query = client.from('players')
      .select('id, profile_id, display_name, created_by')
      .or(`profile_id.eq.${userId},created_by.eq.${userId}`);
    const { data: candidates, error: playerError } = await query;
    if (playerError) throw playerError;
    const normalizedName = displayName?.trim().toLocaleLowerCase();
    const linked = candidates.filter(player =>
      player.profile_id === userId ||
      (normalizedName && player.display_name.trim().toLocaleLowerCase() === normalizedName),
    );
    const playerIds = linked.map(player => player.id);
    if (!playerIds.length) return emptyStats();

    const { data: xis, error: xiError } = await client.from('match_xis')
      .select('match_id, player_id')
      .in('player_id', playerIds);
    if (xiError) throw xiError;
    const matchIds = Array.from(new Set(xis.map(row => row.match_id)));
    if (!matchIds.length) return { ...emptyStats(), playerIds };

    const events: any[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await client.from('match_events')
        .select('id, match_id, kind, payload, sequence')
        .in('match_id', matchIds)
        .order('sequence')
        .range(from, from + 999);
      if (error) throw error;
      events.push(...data);
      if (data.length < 1000) break;
    }
    return aggregate(playerIds, matchIds.length, events);
  },
};

function aggregate(playerIds: string[], matches: number, events: any[]): PersonalStats {
  const ids = new Set(playerIds);
  const byInnings = new Map<string, number>();
  const wicketsByMatch = new Map<string, number>();
  const stats = { ...emptyStats(), playerIds, matches };
  for (const event of events) {
    const p = event.payload ?? {};
    if (event.kind !== 'BALL_RECORDED') continue;
    const inningsId = String(p.innings_id ?? '');
    if (ids.has(p.striker_id)) {
      const runs = Number(p.runs_bat ?? 0);
      stats.runs += runs;
      if (p.extra_kind !== 'WIDE') stats.ballsFaced += 1;
      stats.fours += runs === 4 ? 1 : 0;
      stats.sixes += runs === 6 ? 1 : 0;
      byInnings.set(inningsId, (byInnings.get(inningsId) ?? 0) + runs);
    }
    if (ids.has(p.out_player_id)) stats.dismissals += 1;
    if (ids.has(p.bowler_id)) {
      if (p.is_legal) stats.bowlingBalls += 1;
      const extraKind = p.extra_kind;
      stats.runsConceded += Number(p.runs_bat ?? 0) +
        (extraKind === 'BYE' || extraKind === 'LEG_BYE' ? 0 : Number(p.runs_extra ?? 0));
      if (p.is_wicket && !['RUN_OUT', 'RETIRED_OUT'].includes(String(p.dismissal_kind))) {
        stats.wickets += 1;
        wicketsByMatch.set(event.match_id, (wicketsByMatch.get(event.match_id) ?? 0) + 1);
      }
    }
    if (ids.has(p.fielder_id) && p.dismissal_kind === 'CAUGHT') stats.catches += 1;
  }
  stats.innings = byInnings.size;
  stats.highScore = Math.max(0, ...byInnings.values());
  stats.bestWickets = Math.max(0, ...wicketsByMatch.values());
  return stats;
}

function emptyStats(): PersonalStats {
  return {
    playerIds: [],
    matches: 0,
    innings: 0,
    runs: 0,
    ballsFaced: 0,
    fours: 0,
    sixes: 0,
    highScore: 0,
    dismissals: 0,
    wickets: 0,
    bowlingBalls: 0,
    runsConceded: 0,
    bestWickets: 0,
    catches: 0,
  };
}
