import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(resolve(
  __dirname,
  '../../../supabase/migrations/20260817140000_add_sport_roster_commands.sql',
), 'utf8').toLowerCase() + readFileSync(resolve(
  __dirname,
  '../../../supabase/migrations/20260817143000_add_sport_roster_access_views.sql',
), 'utf8').toLowerCase() + readFileSync(resolve(
  __dirname,
  '../../../supabase/migrations/20260817150000_make_sport_roster_invitations_idempotent.sql',
), 'utf8').toLowerCase() + readFileSync(resolve(
  __dirname,
  '../../../supabase/migrations/20260817151500_fix_sport_membership_end_status.sql',
), 'utf8').toLowerCase();

const commands = [
  'search_sport_players',
  'list_my_sport_club_invitations',
  'list_my_sport_team_invitations',
  'list_sport_club_roster',
  'list_sport_team_roster',
  'create_sport_club',
  'invite_sport_club_member',
  'respond_sport_club_invitation',
  'end_sport_club_membership',
  'create_sport_team',
  'invite_sport_team_member',
  'respond_sport_team_invitation',
  'update_sport_team_member_eligibility',
  'end_sport_team_membership',
  'invite_sport_access',
  'respond_sport_access_invitation',
];

describe('sport roster command migration', () => {
  it('exposes every Phase 2 mutation through a public authenticated command', () => {
    for (const command of commands) {
      expect(migration).toContain(`function public.${command}`);
      expect(migration).toMatch(new RegExp(`grant execute on function public\\.${command}`));
    }
  });

  it('keeps command implementations private and audited', () => {
    for (const command of commands) {
      expect(migration).toContain(`function app_private.${command}`);
      expect(migration).toMatch(new RegExp(`revoke all on function app_private\\.${command}`));
    }
    expect(migration).toContain('write_sport_audit');
    expect(migration).toContain('sport_audit_events');
  });

  it('exposes contextual management checks without a global role', () => {
    expect(migration).toContain('function public.can_manage_sport_club');
    expect(migration).toContain('function public.can_manage_sport_team');
    expect(migration).toContain('select app_private.can_manage_sport_club');
    expect(migration).toContain('select app_private.can_manage_sport_team');
  });

  it('prevents clients from self-provisioning sport identities', () => {
    expect(migration).toContain('revoke insert, update, delete on public.sport_profiles from authenticated');
    expect(migration).toContain('join public.account_sports account_sport');
    expect(migration).toContain("account_sport.access_status = 'active'");
  });

  it('supports singles and doubles eligibility on reusable team memberships', () => {
    expect(migration).toContain('add column eligibility jsonb');
    expect(migration).toContain('["singles", "doubles"]');
    expect(migration).toContain('jsonb_array_length(eligibility) between 1 and 2');
  });

  it('does not grant direct writes to roster foundation tables', () => {
    expect(migration).not.toMatch(/grant\s+(insert|update|delete|all)\s+on\s+public\.sport_/);
  });

  it('makes invitation retries idempotent without duplicating transitions', () => {
    expect(migration).toContain("current_status in ('pending', 'active')");
    expect(migration).toContain("p_accept and selected_membership.status = 'active'");
    expect(migration).toContain("p_accept and status_value = 'active'");
  });

  it('uses typed states for leave and remove transitions', () => {
    expect(migration).toContain("'removed'::public.sport_membership_status");
    expect(migration).toContain("'left'::public.sport_membership_status");
  });
});
