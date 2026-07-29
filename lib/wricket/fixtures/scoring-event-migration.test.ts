import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(
    __dirname,
    '../../../supabase/migrations/20260725133918_add_scoring_event_pipeline.sql',
  ),
  'utf8',
);
const eventKindsMigration = readFileSync(
  resolve(
    __dirname,
    '../../../supabase/migrations/20260725135157_add_scoring_event_kinds.sql',
  ),
  'utf8',
);
const commandMigration = readFileSync(
  resolve(
    __dirname,
    '../../../supabase/migrations/20260725135201_extend_scoring_event_commands.sql',
  ),
  'utf8',
);
const lifecycleMigration = readFileSync(
  resolve(
    __dirname,
    '../../../supabase/migrations/20260725140110_add_match_lifecycle_commands.sql',
  ),
  'utf8',
);
const liveSnapshotMigration = readFileSync(
  resolve(
    __dirname,
    '../../../supabase/migrations/20260728062231_publish_live_match_snapshots.sql',
  ),
  'utf8',
);

describe('scoring event pipeline migration', () => {
  it('enforces one device lease and ordered idempotent events', () => {
    expect(migration).toContain('function app_private.acquire_scoring_lease(');
    expect(migration).toContain('device_id is distinct from p_device_id');
    expect(migration).toContain('client_event_id = p_client_event_id');
    expect(migration).toContain('selected_match.current_sequence <> p_expected_sequence');
  });

  it('updates event, snapshot and sequence in one transaction', () => {
    expect(migration).toContain('insert into public.match_events');
    expect(migration).toContain('insert into public.match_snapshots');
    expect(migration).toContain('set current_sequence = next_sequence');
  });

  it('keeps privileged implementations in the private schema', () => {
    expect(migration).toContain('function app_private.append_match_event(');
    expect(migration).toContain('function public.append_match_event(');
    expect(migration).toContain('security invoker');
  });

  it('supports adjustments, retirements and idempotent ball corrections', () => {
    expect(eventKindsMigration).toContain("'SCORE_ADJUSTED'");
    expect(eventKindsMigration).toContain("'BATTER_RETIRED'");
    expect(commandMigration).toContain("p_kind = 'SCORE_ADJUSTED'");
    expect(commandMigration).toContain("p_kind = 'BATTER_RETIRED'");
    expect(commandMigration).toContain("p_kind = 'BALL_CORRECTED'");
    expect(commandMigration).toContain("payload->>'target_client_event_id'");
  });

  it('hardens the privileged command function', () => {
    expect(commandMigration).toContain("security definer\nset search_path = ''");
    expect(commandMigration).toContain('revoke all on function app_private.append_match_event');
  });

  it('persists authoritative innings and match lifecycle transitions', () => {
    expect(lifecycleMigration).toContain('function app_private.append_match_lifecycle_event(');
    expect(lifecycleMigration).toContain("p_kind = 'INNINGS_CLOSED'");
    expect(lifecycleMigration).toContain("p_kind = 'INNINGS_STARTED'");
    expect(lifecycleMigration).toContain("p_kind = 'MATCH_COMPLETED'");
    expect(lifecycleMigration).toContain("p_kind = 'MATCH_ABANDONED'");
    expect(lifecycleMigration).toContain("status = 'ABANDONED'");
  });

  it('keeps lifecycle privilege out of the exposed schema', () => {
    expect(lifecycleMigration).toContain("security definer\nset search_path = ''");
    expect(lifecycleMigration).toContain(
      'function public.append_match_lifecycle_event(',
    );
    expect(lifecycleMigration).toContain('security invoker');
  });

  it('publishes canonical score snapshots for live viewers', () => {
    expect(liveSnapshotMigration).toContain(
      'alter publication supabase_realtime add table public.match_snapshots',
    );
    expect(liveSnapshotMigration).toContain("tablename = 'match_snapshots'");
  });
});
