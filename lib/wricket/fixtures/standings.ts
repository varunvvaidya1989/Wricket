import type { FixtureGroup, FixtureMatch, PointsRule, StandingRow, Tiebreaker } from './types';

export class StandingsCalculator {
  calculate(
    group: FixtureGroup,
    matches: FixtureMatch[],
    pointsRule: PointsRule = { win: 3, draw: 1, loss: 0 },
    tiebreakers: Tiebreaker[] = ['HEAD_TO_HEAD', 'GOAL_DIFF', 'GOALS_FOR'],
  ): StandingRow[] {
    const rows = new Map(group.teamIds.map(teamId => [teamId, emptyRow(teamId)]));
    const completed = matches.filter(match =>
      match.groupId === group.id &&
      (match.status === 'COMPLETED' || match.status === 'WALKOVER') &&
      match.teamB && match.scoreA != null && match.scoreB != null,
    );
    for (const match of completed) {
      const a = rows.get(match.teamA)!;
      const b = rows.get(match.teamB!)!;
      a.played += 1; b.played += 1;
      a.goalsFor += match.scoreA!; a.goalsAgainst += match.scoreB!;
      b.goalsFor += match.scoreB!; b.goalsAgainst += match.scoreA!;
      if (match.scoreA! > match.scoreB!) {
        a.won += 1; b.lost += 1; a.points += pointsRule.win; b.points += pointsRule.loss;
      } else if (match.scoreB! > match.scoreA!) {
        b.won += 1; a.lost += 1; b.points += pointsRule.win; a.points += pointsRule.loss;
      } else {
        a.drawn += 1; b.drawn += 1; a.points += pointsRule.draw; b.points += pointsRule.draw;
      }
    }
    for (const row of rows.values()) row.goalDifference = row.goalsFor - row.goalsAgainst;
    const ranked = [...rows.values()].sort((a, b) => b.points - a.points);
    let cursor = 0;
    while (cursor < ranked.length) {
      let end = cursor + 1;
      while (end < ranked.length && ranked[end].points === ranked[cursor].points) end += 1;
      const tied = ranked.slice(cursor, end);
      if (tied.length > 1) ranked.splice(cursor, tied.length, ...this.resolveTie(tied, completed, tiebreakers));
      cursor = end;
    }
    ranked.forEach((row, index) => { row.rank = index + 1; });
    return ranked;
  }

  private resolveTie(rows: StandingRow[], matches: FixtureMatch[], chain: Tiebreaker[]): StandingRow[] {
    let groups: StandingRow[][] = [rows];
    for (const rule of chain) {
      groups = groups.flatMap(group => {
        if (group.length < 2) return [group];
        const values = this.values(rule, group, matches);
        const ordered = [...group].sort((a, b) => values.get(b.teamId)! - values.get(a.teamId)!);
        for (const row of ordered) row.tiebreakerTrace.push(`${rule}: ${values.get(row.teamId)}`);
        const partitions: StandingRow[][] = [];
        for (const row of ordered) {
          const last = partitions.at(-1);
          if (!last || values.get(last[0].teamId) !== values.get(row.teamId)) partitions.push([row]);
          else last.push(row);
        }
        return partitions;
      });
    }
    for (const group of groups.filter(group => group.length > 1)) {
      for (const row of group) {
        row.unresolved = true;
        row.tiebreakerTrace.push('UNRESOLVED: manual organiser decision required');
      }
    }
    return groups.flat();
  }

  private values(rule: Tiebreaker, rows: StandingRow[], matches: FixtureMatch[]) {
    if (rule === 'GOAL_DIFF') return new Map(rows.map(row => [row.teamId, row.goalDifference]));
    if (rule === 'GOALS_FOR') return new Map(rows.map(row => [row.teamId, row.goalsFor]));
    const ids = new Set(rows.map(row => row.teamId));
    const values = new Map(rows.map(row => [row.teamId, 0]));
    for (const match of matches.filter(match => match.teamB && ids.has(match.teamA) && ids.has(match.teamB))) {
      if (match.scoreA! > match.scoreB!) values.set(match.teamA, values.get(match.teamA)! + 3);
      else if (match.scoreB! > match.scoreA!) values.set(match.teamB!, values.get(match.teamB!)! + 3);
      else {
        values.set(match.teamA, values.get(match.teamA)! + 1);
        values.set(match.teamB!, values.get(match.teamB!)! + 1);
      }
    }
    return values;
  }
}

function emptyRow(teamId: string): StandingRow {
  return {
    teamId, played: 0, won: 0, drawn: 0, lost: 0, points: 0,
    goalsFor: 0, goalsAgainst: 0, goalDifference: 0, rank: 0,
    unresolved: false, tiebreakerTrace: [],
  };
}

