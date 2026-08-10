import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(__dirname, '../../../supabase/migrations/20260806065744_auction_yodha_account_linking.sql'),
  'utf8',
).toLowerCase();
const confirmationMigration = readFileSync(
  resolve(__dirname, '../../../supabase/migrations/20260806082641_confirm_auction_yodha_profile_link.sql'),
  'utf8',
).toLowerCase();
const permissionMigration = readFileSync(
  resolve(__dirname, '../../../supabase/migrations/20260806083512_fix_auction_yodha_rpc_permissions.sql'),
  'utf8',
).toLowerCase();
const matchingEmailMigration = readFileSync(
  resolve(__dirname, '../../../supabase/migrations/20260806084844_require_matching_email_for_ay_link.sql'),
  'utf8',
).toLowerCase();
const phoneIdentityMigration = readFileSync(
  resolve(__dirname, '../../../supabase/migrations/20260806085908_support_ay_phone_identities.sql'),
  'utf8',
).toLowerCase();

describe('AuctionYodha account linking migration', () => {
  it('keeps legacy contacts private and links verified identities transactionally', () => {
    expect(migration).toContain('alter table public.legacy_player_contacts enable row level security');
    expect(migration).toContain('email_confirmed_at is not null');
    expect(migration).toContain('phone_confirmed_at is not null');
    expect(migration).toContain('app_private.attach_player_account');
    expect(migration).toContain('player_id uuid not null unique');
    expect(migration).not.toContain('create policy "legacy_player_contacts');
  });

  it('requires support app metadata for manual claim approval', () => {
    expect(migration).toContain("auth.jwt()->'app_metadata'->>'is_support_admin'");
    expect(migration).toContain("status = 'pending'");
  });

  it('requires an explicit confirmation before attaching a verified AY match', () => {
    expect(confirmationMigration).toContain("'status', 'verified_match'");
    expect(confirmationMigration).toContain('app_private.confirm_auction_yodha_link');
    expect(confirmationMigration).toContain('email_confirmed_at is not null');
    expect(confirmationMigration).toContain('phone_confirmed_at is not null');
    expect(confirmationMigration).toContain('if link_method is null then raise exception');
    expect(confirmationMigration).not.toContain("perform app_private.attach_player_account(account_id_value, contact_matches[1]");
  });

  it('allows authenticated public wrappers to invoke only the required private link functions', () => {
    expect(permissionMigration).toContain('grant execute on function app_private.resolve_auction_yodha_link(text) to authenticated');
    expect(permissionMigration).toContain('grant execute on function app_private.confirm_auction_yodha_link(uuid) to authenticated');
    expect(permissionMigration).not.toContain('grant usage on schema app_private');
  });

  it('requires matching verified emails and prevents another account from claiming the player', () => {
    expect(matchingEmailMigration).toContain('contact.email_verified');
    expect(matchingEmailMigration).toContain('if ay_email <> verified_email then');
    expect(matchingEmailMigration).toContain('belongs to a different verified email account');
    expect(matchingEmailMigration).toContain('link.player_id = p_player_id and link.account_id <> account_id_value');
    expect(matchingEmailMigration).toContain('already linked to another sportstage account');
  });

  it('uses verified phones only for AY synthetic phone-email identities', () => {
    expect(phoneIdentityMigration).toContain("like '%@phone.auctionyodha.local'");
    expect(phoneIdentityMigration).toContain('contact.phone_verified and verified_phone is not null');
    expect(phoneIdentityMigration).toContain('verify your sportstage phone number');
    expect(phoneIdentityMigration).toContain('belongs to a different verified phone account');
    expect(phoneIdentityMigration).toContain("link_method := 'phone'");
  });
});
