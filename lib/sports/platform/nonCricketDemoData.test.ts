import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const scriptRoot = resolve(__dirname, '../../../scripts');
const seed = readFileSync(resolve(scriptRoot, 'seed-non-cricket-production-demo.sql'), 'utf8');
const clear = readFileSync(resolve(scriptRoot, 'clear-non-cricket-production-demo.sql'), 'utf8');
const manager = readFileSync(resolve(scriptRoot, 'manage-non-cricket-demo.mjs'), 'utf8');

describe('reversible non-cricket production demo data', () => {
  it('covers every non-cricket sport with accounts, competitions, leagues, matches and events', () => {
    for (const sport of ['TENNIS', 'BADMINTON', 'PADEL', 'TABLE_TENNIS', 'PICKLEBALL']) {
      expect(seed).toContain(`'${sport}'`);
    }
    expect(seed.match(/2d000000-0000-4000-8000-00000000000[1-8]/g)).toHaveLength(8);
    expect(seed).toContain("'TOURNAMENT'::public.sport_competition_kind");
    expect(seed).toContain("'LEAGUE'::public.sport_competition_kind");
    expect(seed).toContain("'LIVE'::public.sport_competition_lifecycle");
    expect(seed).toContain("'COMPLETED'::public.sport_competition_lifecycle");
    expect(seed).toContain("'REGISTRATION_OPEN'::public.sport_competition_lifecycle");
    expect(seed).toContain("'mock_seed_batch', marker");
    expect(seed).toContain("rules || jsonb_build_object('mock_seed_batch', marker)");
    expect(seed).not.toContain("marker_label || ' Reversible production showcase");
  });

  it('scopes cleanup to the marker and real target owner, with an exact confirmation gate', () => {
    expect(clear).toContain("owner_account_id = target_account");
    expect(clear).toContain("rules ->> 'mock_seed_batch' = marker");
    expect(clear).toContain("raw_app_meta_data ->> 'mock_seed_batch' = marker");
    expect(clear).toContain('begin;');
    expect(clear).toMatch(/commit;\s*$/i);
    expect(manager).toContain('DELETE_NON_CRICKET_DEMO_2026_V1');
    expect(manager).toContain("projectRef !== EXPECTED_PROJECT_REF");
    expect(manager).toContain("args.has('--dry-run')");
  });
});
