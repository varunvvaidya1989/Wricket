import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(__dirname, '../../../supabase/migrations/20260821060906_add_sport_operations_and_rollout.sql'), 'utf8').toLowerCase();
const integration = readFileSync(resolve(__dirname, '../../../supabase/migrations/20260821064105_integrate_sport_platform_surfaces.sql'), 'utf8').toLowerCase();

describe('sport operations and rollout migration', () => {
  it('provides account-scoped notifications and deep links', () => {
    expect(source).toContain('create table public.sport_notifications');
    expect(source).toContain('sport_notifications_read_own');
    expect(source).toContain('deep_link');
  });
  it('deep-links notifications into a real sport app route', () => {
    expect(integration).toContain('select coalesce(app_route');
    expect(integration).toContain("notification.deep_link = '/sports'");
    expect(integration).toContain('sport_route text');
  });
  it('captures audit telemetry without exposing it directly', () => {
    expect(source).toContain('create table public.sport_operational_events');
    expect(source).toContain('sport_audit_capture_operation');
    expect(source).not.toContain('grant select on public.sport_operational_events');
  });
  it('scopes support actions to competition managers with reasons', () => {
    expect(source).toContain('execute_sport_support_action');
    expect(source).toContain('require_managed_competition');
    expect(source).toContain('a support action reason is required');
  });
  it('defines retention, checkpoints, and recoverable cleanup', () => {
    expect(source).toContain('create table public.sport_retention_policies');
    expect(source).toContain('create table public.sport_recovery_checkpoints');
    expect(source).toContain('prune_sport_operational_data');
  });
  it('gives every rollout a sequence, owner, signal, and rollback', () => {
    expect(source).toContain('create table public.sport_rollout_plans');
    expect(source).toContain('owner_label');
    expect(source).toContain('monitoring_signal');
    expect(source).toContain('rollback_procedure');
    expect(source).toContain('array[0, 10, 25, 50, 100]');
  });
});
