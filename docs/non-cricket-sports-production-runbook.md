# Non-Cricket Sports Production Runbook

## Release gates

- Run focused and full Vitest suites, strict TypeScript, Expo lint, architecture checks, and web export.
- Run linked Supabase pgTAP/RLS tests and security/performance advisors.
- Confirm web and native smoke-test fields in `sport_rollout_plans` before increasing rollout.
- Confirm public snapshots contain only the guest-safe projection columns.
- Enable Supabase Auth leaked-password protection before broad production rollout.
- Replace the Google sample iOS AdMob app ID with the account-owned production ID before a monetized App Store release.

## Service targets

- Public discovery database latency: p95 below 250 ms and every request below 1 second during the 200-request linked release exercise.
- Projection recovery: standings and player-statistics rebuild below 5 seconds for a populated linked-project competition, with identical checksums on immediate replay.
- Guest live freshness: snapshots become stale after 2 minutes and must be refreshed or marked stale rather than presented as current.
- Scoring recovery: preserve the immutable event log and authoritative results; create a checkpoint before support changes and rebuild all projections in one support operation.

## Advisor baseline

- Release review has no error-level advisor findings.
- Security warnings include 73 intentional sport RPC gateways that use `SECURITY DEFINER` with internal authorization checks and explicit role grants. Their callable surface is covered by linked RLS tests.
- Supabase Auth leaked-password protection remains a project-dashboard action before broad production rollout.
- The 49 performance warnings are existing auth init-plan and multiple-permissive-policy findings; none target the new `sport_*` tables introduced in Phases 6-8.

## Rollout

Increase each sport and feature through `0, 10, 25, 50, 100` percent. Hold each stage until its configured monitoring signal is healthy. Disable the feature and set rollout to zero when rollback criteria are met; do not delete authoritative events or results.

## Monitoring

Watch command failures, authorization denials, sync conflicts, scoring latency, public-feed freshness, and notification delivery. Audit-derived operational events identify the affected sport and resource without granting a global support role.

## Recovery

Create a competition recovery checkpoint before support changes. Rebuild standings and statistics from authoritative results after corrections. Public snapshots are disposable projections and can be refreshed. Expired scoring leases may be released through the scoped support command.

## Retention and deletion

Scoring events and published history follow each sport's retention policy. Account-linked notifications and follows cascade on account deletion. Competition ownership must be transferred before deleting an owner whose active competitions must remain available.
