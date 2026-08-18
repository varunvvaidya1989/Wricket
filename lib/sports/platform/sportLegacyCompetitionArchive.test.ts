import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const component = readFileSync(resolve(
  __dirname,
  '../../../components/sports/scoring/SportLegacyCompetitionArchiveScreen.tsx',
), 'utf8');

describe('legacy competition archive', () => {
  it('is explicitly read-only and contains no mutation imports', () => {
    expect(component).toContain('READ-ONLY DEVICE ARCHIVE');
    expect(component).not.toContain('saveSportCompetition');
    expect(component).not.toContain('removeSportCompetition');
    expect(component).not.toContain('saveScoringSession');
  });

  it.each(['tennis', 'badminton', 'padel', 'table-tennis', 'pickleball'])(
    'preserves list and detail routes for %s',
    segment => {
      expect(existsSync(resolve(__dirname, `../../../app/${segment}/legacy-competitions.tsx`))).toBe(true);
      expect(existsSync(resolve(__dirname, `../../../app/${segment}/legacy-competition/[id].tsx`))).toBe(true);
    },
  );
});
