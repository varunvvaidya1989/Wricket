import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(
    __dirname,
    '../../../supabase/migrations/20260725080400_add_server_authoritative_match_setup.sql',
  ),
  'utf8',
);
const privateSchemaGrantMigration = readFileSync(
  resolve(
    __dirname,
    '../../../supabase/migrations/20260726131507_grant_private_rpc_schema_usage.sql',
  ),
  'utf8',
);

describe('server-authoritative match setup migration', () => {
  it('stores playing XIs and innings under the canonical match', () => {
    expect(migration).toContain('create table public.match_xis');
    expect(migration).toContain('create table public.match_innings');
    expect(migration).toContain('unique (match_id, sequence)');
  });

  it('validates authorization, membership and toss before starting', () => {
    expect(migration).toContain("member.role in ('OWNER', 'ADMIN', 'SCORER')");
    expect(migration).toContain('left join public.team_players membership');
    expect(migration).toContain('Toss winner must be one of the match teams');
  });

  it('keeps the security-definer implementation in the private schema', () => {
    expect(migration).toContain('function app_private.start_match_setup(');
    expect(migration).toContain('function public.start_match_setup(');
    expect(migration).toContain('security invoker');
  });

  it('allows authenticated wrappers to resolve private implementations', () => {
    expect(privateSchemaGrantMigration).toContain(
      'grant usage on schema app_private to authenticated',
    );
    expect(privateSchemaGrantMigration).toContain(
      'revoke create on schema app_private from authenticated',
    );
    expect(privateSchemaGrantMigration).toContain(
      'revoke all on schema app_private from public, anon',
    );
  });
});
