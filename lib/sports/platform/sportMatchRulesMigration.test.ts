import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(resolve(
  __dirname,
  '../../../supabase/migrations/20260824094013_add_sport_competition_match_rules.sql',
), 'utf8');
const competitions = readFileSync(resolve(
  __dirname,
  '../../../components/sports/scoring/SportCompetitionsScreen.tsx',
), 'utf8');
const detail = readFileSync(resolve(
  __dirname,
  '../../../components/sports/scoring/SportCloudCompetitionDetailScreen.tsx',
), 'utf8');

describe('sport match rules persistence', () => {
  it('creates and updates competition rules through authenticated commands', () => {
    expect(migration).toContain('create_sport_competition_with_rules');
    expect(migration).toContain('update_sport_competition_match_rules');
    expect(migration).toContain('Match rules are locked after scoring starts');
    expect(migration).toContain('to authenticated');
    expect(migration).toContain('from public, anon;');
  });

  it('configures rules at creation and inherits them when scoring fixtures', () => {
    expect(competitions).toContain('<SportMatchRulesEditor');
    expect(competitions).toContain('rules,');
    expect(detail).toContain('<SportCompetitionOverview');
    expect(detail).toContain('setRulesOpen(true)');
    expect(detail).toContain('options: normalizeSportRules(sportId, detail?.competition.rules)');
  });
});
