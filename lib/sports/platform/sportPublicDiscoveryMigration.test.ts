import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(__dirname, '../../../supabase/migrations/20260821060902_add_sport_public_discovery.sql'), 'utf8').toLowerCase();
const integration = readFileSync(resolve(__dirname, '../../../supabase/migrations/20260821064105_integrate_sport_platform_surfaces.sql'), 'utf8').toLowerCase();

describe('sport public discovery migration', () => {
  it('publishes only a denormalized guest-safe snapshot', () => {
    expect(source).toContain('create table public.sport_public_live_snapshots');
    expect(source).toContain('detail_requires_auth boolean not null default true');
    expect(source).not.toContain('lineup_snapshot jsonb');
  });
  it('excludes private and unpublished competitions during refresh', () => {
    expect(source).toContain("competition.visibility <> 'public'");
    expect(source).toContain("competition.lifecycle not in ('published', 'live', 'completed', 'archived')");
  });
  it('supports bounded cursor pagination, throttling, and stale state', () => {
    expect(source).toContain('public discovery rate limit exceeded');
    expect(source).toContain('limit least(greatest(p_limit, 1), 50)');
    expect(source).toContain('stale_after');
  });
  it('supports cross-sport follows and an account-only feed', () => {
    expect(source).toContain('create table public.sport_follows');
    expect(source).toContain('list_my_sport_following_feed');
    expect(source).toContain("resource_type in ('match', 'player', 'team', 'club', 'competition')");
  });
  it('projects the safe sport identifier required by match follows', () => {
    expect(integration).toContain('add column sport_id uuid');
    expect(integration).toContain('sport_id = match.sport_id');
    expect(integration).toContain('alter column sport_id set not null');
  });
  it('makes player cards opt-in and owner controlled', () => {
    expect(source).toContain('is_public boolean not null default false');
    expect(source).toContain('only the profile owner can change this public card');
  });
});
