import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(__dirname, '../../../supabase/migrations/20260821081956_add_sportstage_upcoming_discovery.sql'),
  'utf8',
).toLowerCase();

describe('SportStage upcoming discovery migration', () => {
  it('projects both cricket and racket schedules without account data', () => {
    expect(source).toContain('create table public.sportstage_upcoming_snapshots');
    expect(source).toContain("'sport_fixture'");
    expect(source).toContain("'cricket_match'");
    expect(source).toContain("sport.code in ('tennis', 'badminton', 'padel', 'table_tennis', 'pickleball')");
    expect(source).not.toMatch(/sportstage_upcoming_snapshots[\s\S]{0,500}account_id/);
  });

  it('exposes only a caller-permission discovery function', () => {
    expect(source).toContain('function public.discover_sportstage_upcoming');
    expect(source).toContain('security invoker');
    expect(source).toContain('grant execute on function public.discover_sportstage_upcoming');
    expect(source).toContain('to anon, authenticated');
    expect(source).toContain('revoke all on function app_private.rebuild_sportstage_upcoming_snapshots');
  });

  it('expands personalization across every supported follow type', () => {
    for (const type of ['MATCH', 'PLAYER', 'TEAM', 'CLUB', 'COMPETITION']) {
      expect(source).toContain(`follow.resource_type = '${type.toLowerCase()}'`);
    }
    expect(source).toContain("snapshot.status = 'live'");
  });
});
