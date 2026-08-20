import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const apps = [
  { segment: 'tennis', id: 'tennis' },
  { segment: 'badminton', id: 'badminton' },
  { segment: 'padel', id: 'padel' },
  { segment: 'table-tennis', id: 'table_tennis' },
  { segment: 'pickleball', id: 'pickleball' },
] as const;

describe('independent sport app routes', () => {
  it.each(apps)('$segment owns overview, competition, match and stats routes', ({ segment, id }) => {
    const appRoot = resolve(__dirname, `../../../app/${segment}`);
    const routes = [
      '_layout.tsx',
      'index.tsx',
      'competitions.tsx',
      'competition/[id].tsx',
      'legacy-competitions.tsx',
      'legacy-competition/[id].tsx',
      'clubs.tsx',
      'club/[id].tsx',
      'team/[id].tsx',
      'matches.tsx',
      'stats.tsx',
      'my-sport.tsx',
      'search.tsx',
      'match/new.tsx',
      'match/[id]/score.tsx',
    ];
    routes.forEach((route) => expect(existsSync(resolve(appRoot, route))).toBe(true));
    expect(readFileSync(resolve(appRoot, 'index.tsx'), 'utf8')).toContain(`sportId="${id}"`);
    const competitionRoute = readFileSync(resolve(appRoot, 'competition/[id].tsx'), 'utf8');
    expect(competitionRoute).toContain('SportCloudCompetitionDetailScreen');
    expect(competitionRoute).toContain(`sportId="${id}"`);
  });

  it('does not expose a generic court-scoring route', () => {
    expect(existsSync(resolve(__dirname, '../../../app/court/index.tsx'))).toBe(false);
  });
});
