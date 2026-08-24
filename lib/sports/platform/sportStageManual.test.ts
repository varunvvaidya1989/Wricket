import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const manual = readFileSync(resolve(__dirname, '../../../app/manual.tsx'), 'utf8');
const competition = readFileSync(resolve(__dirname, '../../../components/sports/scoring/SportCloudCompetitionDetailScreen.tsx'), 'utf8');
const drawer = readFileSync(resolve(__dirname, '../../../components/sports/scoring/SportProfileDrawer.tsx'), 'utf8');

describe('SportStage task manual and fixture hierarchy', () => {
  it('documents the complete player, organizer, scorer, and viewer journeys', () => {
    for (const heading of [
      'Set up your player account',
      'Create an individual match',
      'Create a tournament or league',
      'Add clubs, teams, and entrants',
      'Schedule and prepare fixtures',
      'Score a live match',
      'Watch live and upcoming sport',
      'Results, standings, and statistics',
      'Fix common problems safely',
    ]) expect(manual).toContain(heading);
    expect(manual).toContain('Search the manual');
    expect(drawer).toContain('How to use SportStage');
  });

  it('keeps secondary fixture administration collapsed behind a named control', () => {
    expect(competition).toContain('Manage fixture');
    expect(competition).toContain('accessibilityState={{ expanded: manageOpen }}');
    expect(competition).toContain('START SCORING');
    expect(competition).toContain('CHANGE TIME / COURT');
    expect(competition).toContain('CANCEL FIXTURE');
    expect(competition).not.toContain('LINEUP A');
    expect(competition).not.toContain('LINEUP B');
  });
});
