import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(__dirname, path), 'utf8');
const accountApi = read('../../supabase/sportstageAccountApi.ts');
const discoveryApi = read('../../supabase/sportDiscoveryApi.ts');
const profileApi = read('../../supabase/profiles.ts');
const resultsApi = read('../../supabase/sportResultsApi.ts');
const rootGate = read('../../../components/providers/RootAccessGate.tsx');
const liveScreen = read('../../../components/sports/platform/SportStageLiveScreen.tsx');
const easConfig = JSON.parse(read('../../../eas.json')) as {
  build: Record<string, { env: Record<string, string> }>;
};

describe('non-cricket release surfaces', () => {
  it('keeps production and preview builds closed while development can opt in', () => {
    expect(easConfig.build.production.env.EXPO_PUBLIC_ENABLE_NON_CRICKET_SPORTS).toBe('false');
    expect(easConfig.build.preview.env.EXPO_PUBLIC_ENABLE_NON_CRICKET_SPORTS).toBe('false');
    expect(easConfig.build.development.env.EXPO_PUBLIC_ENABLE_NON_CRICKET_SPORTS).toBe('true');
  });

  it('filters selection and sanitizes profile updates before the RPC', () => {
    expect(accountApi).toContain('.filter((row) => isSportReleased(row.code))');
    expect(accountApi).toContain('const allowedSportCodes = releasedSportCodes(sportCodes)');
    expect(accountApi).toContain('p_sport_codes: allowedSportCodes');
    expect(profileApi).toContain('.filter((sport) => isSportReleased(sport.code))');
  });

  it('gates direct routes and every public or profile discovery boundary', () => {
    expect(rootGate).toContain('isSportReleased(requiredSport)');
    expect(liveScreen).toContain('RELEASED_SPORTSTAGE_SPORTS.map');
    expect(discoveryApi).toContain('isSportReleased(snapshot.sportCode)');
    expect(discoveryApi).toContain('!isSportReleased(String(data.sport_code))');
    expect(resultsApi).toContain('isSportReleased(stat.sportCode)');
  });
});
