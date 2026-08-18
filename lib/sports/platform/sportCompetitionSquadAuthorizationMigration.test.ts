import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(resolve(
  __dirname,
  '../../../supabase/migrations/20260818122000_require_team_control_for_squad_registration.sql',
), 'utf8').toLowerCase();

describe('tournament squad registration authorization migration', () => {
  it('requires team control before entering the trusted registration command', () => {
    expect(migration).toContain('if not app_private.can_manage_sport_team(p_team_id)');
    expect(migration).toContain('only the team owner, manager, or captain can submit this squad');
    expect(migration.indexOf('can_manage_sport_team')).toBeLessThan(
      migration.indexOf('return app_private.register_sport_tournament_squad'),
    );
  });

  it('keeps the command unavailable to anonymous clients', () => {
    expect(migration).toContain('from public, anon');
    expect(migration).toContain('to authenticated');
    expect(migration).not.toContain('to anon');
  });
});
