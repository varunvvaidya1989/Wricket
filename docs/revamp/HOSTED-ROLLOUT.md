# Hosted revamp rollout — 11 October 2026

Target: Wricket, `lzgnuqwvsioinwwrsdvn`, Mumbai. The app configuration and CLI link identify the same project. The unrelated MindBull project was not modified.

## Applied schema

Authorised CLI access is restored. The hosted ledger matched all 109 older repository migrations; no migration repair or history rewrite was required. A schema-only snapshot was saved before deployment. The 14 previously pending revamp migrations were applied in order, followed by three reviewed corrective migrations:

- `20261011093749_add_cricket_mvp_worker_monitoring.sql`: private, service-only heartbeat with validated aggregate counts.
- `20261011094408_support_legacy_cricket_mvp_rule_snapshots.sql`: retry supported explicit legacy rules and reset attempts/leases only on an authorised recalculation.
- `20261011095737_avoid_direct_profile_media_deletion.sql`: allow media-free account deletion without touching Storage metadata; require Storage API removal before deleting an account with profile media.

The ledger now contains 126 migrations. Applied files were retained unchanged. CLI `db push` produced a warning while caching its optional pg-delta catalog on Windows; the migration application succeeded and database postconditions were checked independently. This warning was not treated as a successful schema diff.

## Worker and monitoring

The `cricket-mvp-worker` Edge Function runs inside the existing Supabase project. No separate hosting server is required. The function is built from the canonical app MVP algorithm, cloud event adapter and shared server batch/monitor code. `npm run mvp:edge:check` rejects an outdated generated function.

Supabase Cron invokes a two-job worker batch every ten seconds and a monitor every minute. SQL leases protect concurrent invocations and reject snapshots superseded by corrections. A dedicated server-only 256-bit bearer token is checked before any database access, held in Edge secrets and Vault, and omitted from app configuration, logs and release evidence. `verify_jwt = false` is needed for this dedicated credential; the handler still rejects anonymous callers, user JWTs and wrong tokens.

Monitoring checks queue age, failed/exhausted attempts, expired leases and a service-only worker heartbeat. It records aggregate JSON in Edge logs and returns HTTP 503 for unhealthy states. Cron's SQL success means the HTTP request was queued: inspect `net._http_response` and Edge logs for actual function status. Alert delivery to email, Slack or an external pager is not configured; no destination was provided.

The worker calculated 19 historical matches after compatibility validation. Seven DWC Premier League matches have empty saved rules and remain failed after bounded retries. Their tournaments currently specify two overs, but that does not establish each historical match's limit. These records require confirmed innings limits before an authorised repair/recalculation. No delivery history, old match result or guessed innings limit was rewritten. Match IDs and public team names are listed in ignored `.e2e/hosted/legacy-mvp-data-issues.json`.

## Hosted verification

The scoped acceptance script uses newly created organiser/scorer/viewer accounts and temporary tournaments. It verifies captain claims, invitation replay denial, organiser team removal, phone privacy, privileged endpoint denial, match/event idempotency, assigned scorer access and revocation, published player registration, manual payment status and safe public directory data. The deployed scheduled worker calculates completion and correction rankings, and an independently authenticated viewer receives both changes through Realtime.

Completion and correction are controlled fixture writes; this is backend acceptance, not a full hosted UI tournament or pilot sign-off. The script records its exact case list and cleanup result. Test accounts/tournaments/players are removed through authorised APIs after identity/run ownership checks. The account-deletion Storage defect was reproduced, regression-tested and fixed before the final rerun.

The final rerun passes all seven grouped backend cases and confirms cleanup. The original 10 tournaments and 63 matches remain. The full build passes lint, strict types, 153 test files / 845 tests, environment/architecture checks and web export. Hosted security advisors report no error-level issues. `.e2e/hosted/final-status.json` records matched migrations, permission checks, active schedules, fresh heartbeat and the seven historical data issues against the current source fingerprint. The release audit now passes the hosted migration gate and retains the worker gate as PARTIAL; physical/Apple, signed-build, full-platform and pilot gates remain open.

Private connection/key/secret files stay under ignored `.e2e/hosted/`. Do not attach `api-keys.json`, `mvp-worker.env`, the secret-bearing scheduler installation SQL or account manifests to a release.

## Operator commands

From `mobile/`, with authorised Supabase CLI access:

```sh
npm run supabase:hosted:preflight
npm run mvp:edge:build
npm run mvp:edge:check
# Review migration history/schema and apply only verified pending files first.
npx supabase db push --linked --dry-run
npx supabase db push --linked --yes
npm run mvp:edge:deploy
```

Deployment targets only the explicit Wricket project, keeps its dedicated token on reruns and re-enables both named Cron jobs. It does not reset any database or prune other Edge Functions.

Useful hosted checks:

```sql
select jobname,schedule,active from cron.job
where jobname in ('wricket-cricket-mvp-worker','wricket-cricket-mvp-monitor');
select public.get_cricket_mvp_worker_heartbeat();
select status,error,count(*) from public.match_mvp_calculations group by status,error;
select status_code,timed_out,error_msg,content,created
from net._http_response order by created desc limit 10;
```

To pause calculation safely, call `cron.alter_job(jobid,active := false)` for the worker job only; keep the monitor running. Retain queue/history and additive schema. After a correction, rebuild/check/redeploy the function and re-enable the worker. Never mark incomplete data successful merely to silence monitoring.

Node/systemd files under `deploy/mvp-worker/` are an optional alternative runtime. They were prepared but were not installed on a server. The selected deployment uses Supabase Edge Functions and Cron.

References: [Supabase scheduling](https://supabase.com/docs/guides/functions/schedule-functions), [function limits](https://supabase.com/docs/guides/functions/limits), [Storage deletion](https://supabase.com/docs/guides/storage/management/delete-objects).
