import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(resolve(
  __dirname,
  '../../../supabase/migrations/20260821125102_enable_sport_scoring_realtime.sql',
), 'utf8').toLowerCase();
const scoringApi = readFileSync(resolve(__dirname, '../../supabase/sportScoringApi.ts'), 'utf8');
const feedScreen = readFileSync(resolve(
  __dirname,
  '../../../components/sports/platform/SportCloudMatchFeedScreen.tsx',
), 'utf8');

describe('sport scoring realtime delivery', () => {
  it('publishes the authoritative event, match, and live snapshot tables', () => {
    expect(migration).toContain('alter publication supabase_realtime add table public.sport_scoring_events');
    expect(migration).toContain('alter publication supabase_realtime add table public.sport_scoring_matches');
    expect(migration).toContain('alter publication supabase_realtime add table public.sport_public_live_snapshots');
  });

  it('reloads the authoritative feed after each scoped database change', () => {
    expect(scoringApi).toContain('subscribe(scoringMatchId: string');
    expect(scoringApi).toContain("table: 'sport_scoring_events'");
    expect(scoringApi).toContain("table: 'sport_scoring_matches'");
    expect(feedScreen).toContain('sportScoringApi.subscribe(id, () => void load(true)');
    expect(feedScreen).not.toContain('setInterval');
  });
});
