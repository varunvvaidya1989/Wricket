# Phase 9 / UX-R8 release readiness

Updated 11 October 2026. Local release engineering is implemented and verified. The hosted schema and scheduled MVP Edge worker are deployed; backend permission and independent Realtime checks pass. Seven historical matches require confirmed innings limits and remain flagged by monitoring. Signed Android versions 9 and 10 passed an actual emulator upgrade/recovery rehearsal over production version 8. The latest web app is deployed to sportstageapp.expo.app. Overall release acceptance remains BLOCKED by data remediation, physical-device and pilot evidence; Apple is outside the user's current Android scope. See [hosted rollout](HOSTED-ROLLOUT.md) and [signed rehearsal](SIGNED-ANDROID-REHEARSAL.md).

## Revision and acceptance evidence

The workspace contains pre-existing and new uncommitted changes. The evidence generator records HEAD plus a SHA-256 fingerprint of the actual non-ignored application, migration, test, configuration and script source. A HEAD hash alone would misidentify this candidate. Generated exports/logs, local credentials and device state remain ignored.

The latest full build passes lint, strict types, 153 files / 845 tests, environment and architecture checks, and web export. Local acceptance includes all fixture strategies/graphs, an organiser/scorer tournament with 15 actual matches and 120 delivery events, golden correction-aware statistics, community flows, large schedules and Android large-text navigation. The detailed case scope is in [Phase 7](UX-R6-REVIEW.md), [Phase 8](UX-R7-REVIEW.md) and the [completion tracker](PHASES-7-9-COMPLETION.md).

Generate and audit the local manifest from `mobile/`:

```sh
node scripts/revamp-release-evidence.mjs
npm run revamp:release:check -- --evidence .e2e/release/evidence.json --output .e2e/release/gate.json
```

The current audit must return BLOCKED (exit 2). It requires E01-E30 on Chromium/Firefox/WebKit/Android/iOS and eight additional release gates. Local case coverage is PARTIAL; E08/E09 remain PAUSED at the user's instruction. A pass needs a verifier/date, supported platforms and available SHA-256-matching artifacts from the same source fingerprint. Synthetic audit unit tests demonstrate acceptance/rejection rules; they are not release acceptance evidence. Do not replace pending platform checks with browser screenshots.

## Upgrade and UI recovery

SQLite migration 15 adds `ui_version` without changing history, IDs or scoring commands. `revamp-upgrade.test.ts` loads the previous committed schema 14 (HEAD `3ebd23c4e749335bc97335a844b492d85820bebe`), seeds a saved NEXT_BOWLER prompt and queued event, reopens the database and applies the migration twice. IDs, totals, prompt, pending payload/attempt count and event bytes are retained. Existing scoring-session updates preserve a saved UI version.

`EXPO_PUBLIC_WRICKET_SCORING_UI` accepts `revamp-v1` (default) or `recovery-v1`. New sessions choose the configured version. An active saved session pins its known version, so changing a rollout flag does not switch the pad during an innings. Recovery presents larger numeric keys while retaining both numeric and gesture scoring commands and the existing privacy rules. It is a supported recovery presentation, not a recreation of an earlier insecure screen.

Rollback rehearsal procedure:

1. Build a candidate with the flag and record its artifact hash/version.
2. Start a match, record runs, stop at a required prompt and queue an offline update; capture canonical IDs and outbox state.
3. Install the candidate over the previous installed signed version without clearing app data. Relaunch offline; verify the same prompt/totals/history, then reconnect and verify exactly-once replay on another viewer.
4. Ship a candidate configured for `recovery-v1`. Confirm the active session retains its pinned version; only a newly started session adopts recovery. Confirm contacts remain private and both input methods remain available.
5. Record signed artifacts, OS/device versions, event IDs and screenshots. Stop rollout if history, pending prompts or queued data diverge.

Signed Android installation 8 → 9 → 10 now passes on the dedicated Android 14 emulator: original matches, both prompt types, queued scoring, exact-once reconnect and active/new recovery layout behavior were checked. See [artifact identities, evidence and limitations](SIGNED-ANDROID-REHEARSAL.md). The previous release required two test teams cached for this rehearsal, and the first offline version 9 launch required one connected authorization. Physical/Play-installed upgrade remains open.

## Measured local behavior

Windows development bundle, Chrome 154 and isolated Docker PostgreSQL:

| Measurement | Observed | Scope |
| --- | --- | --- |
| Scoring click-to-feedback/assertion | n=36; p50 85.8 ms; p95 125.2 ms; max 129.3 ms | Resumed actual tournament; includes automation overhead, not all 120 deliveries |
| Generate/read 2,016 fixtures | 1,108 ms | Local actual API/database |
| Open large tournament | 4,818 ms | Development cold route, sync and automation |
| First-to-last fixture page | 106 ms | 40-card rendering bound; last page has 16 cards |

After the web-memory fix, the cold development opening time is recorded rather than described as meeting a release budget. There is no comparable original-build physical baseline here. Low-end Android/iOS budgets, p99, touch/haptic behavior, memory growth and a physical 30-minute soak remain open. Do not extrapolate these local values to production.

## Web cache compatibility fix

WebKit acceptance reproduced `navigator.storage.getDirectory()` failing with UnknownError in its worker. Inspection showed Expo SQLite 16.0.10 eagerly creating its OPFS VFS even for Wricket's `:memory:` database. The version/checksum-checked `postinstall` patch now initialises MemoryVFS first and requests OPFS only for named persistent operations. Native SQLite sources are unchanged. Persistent failures still propagate; there is no silent replacement of a durable database. Three regression cases verify these boundaries. A second patch run is idempotent.

The tracked patch and installer are in `patches/expo-sqlite-16.0.10-web-memory.json` and `scripts/patch-expo-sqlite-web.mjs`. Review or remove the workaround when upgrading Expo SQLite; an unexpected version/source checksum intentionally stops installation. The local reproduction is `.e2e/webkit-opfs-diagnostics.log`. Expo's [SQLite web documentation](https://docs.expo.dev/versions/v54.0.0/sdk/sqlite/) describes its web prerequisites; the inspected installed worker establishes this defect. The upstream [OPFS initialisation issue](https://github.com/expo/expo/issues/47694) provides related context. Playwright notes that [WebKit on macOS is closer to Safari](https://playwright.dev/docs/browsers); local Windows WebKit remains supplementary to actual Apple acceptance.

The browser journey signs in using the approved canonical tournament return link instead of tearing down a loading Home page with a hard navigation. Error collection remains enabled. Removed Moments are checked after an authoritative refresh; Realtime row permissions are not widened to expose removed posts. Native pull-to-refresh and route focus also reload the social feed while retaining an unsent draft.

## Hosted migration and worker runbook

The original seven Phase 7-9 migrations were first verified against `wricket-e2e`. Hosted access has subsequently been restored: all 109 older migration versions matched the repository, 14 pending revamp migrations were applied, and three reviewed operational corrections bring the hosted ledger to 126. The local stack's older drift was not used to rewrite hosted history. The prior HTTP 403 is resolved. Before/after hosted artifacts are under ignored `.e2e/hosted/`.

Before deployment, obtain authorised hosted database access, compare its migration ledger and schema with the repository, review older drift, and apply only verified pending migrations in order. The new fixture/deletion functions, MVP leases/schema grant, Realtime publication and safe Moments names are dependencies of the new client. Keep applied migrations immutable; corrections use new migrations.

The selected runtime is the deployed Supabase Edge Function plus Cron; a separate server is not required. The worker runs every ten seconds and the monitor every minute. See [deployment, authentication, monitoring and recovery](HOSTED-ROLLOUT.md). The Node worker remains an alternative: configure `WRICKET_SUPABASE_PROJECT_REF`, matching `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` only in server secrets. Its project check prevents accidental targeting, its loop polls every three seconds, and `--once` supports one batch. Never bundle a service key in the mobile app.

Observe batch JSON counts (`claimed`, `completed`, `superseded`, `failed`), oldest pending age, expired processing leases and failed jobs/attempts. Jobs have five-minute leases and bounded automatic retries. Alert on non-draining backlog, repeated failures, permission errors or rankings that remain stale after completion/correction. Investigate failed snapshots before requesting an authorised recalculation; do not silently mark failures successful or insert calculated results from a client. Rehearse completion and correction with an independent viewer after deployment. A worker lease superseded by a correction is an expected convergence event.

The recovery flag controls scoring presentation only; it does not roll back database permissions or MVP data. Retain additive migrations during presentation rollback. Pause the worker if calculation correctness is uncertain, retain the queue/history, fix the defect and recalculate via the existing permission-checked path.

## Platform, release and pilot gates

| Gate | Current evidence | Still required |
| --- | --- | --- |
| Browser | Actual local Chromium/Firefox/WebKit community and Chromium organiser/scorer journeys | Full E01-E30 matrix for each supported browser |
| Android | Dedicated Android 14 emulator, current JS, large text and prior process-kill/offline replay | Physical TalkBack, photo picker/permissions, low-end performance and Play-installed upgrade |
| Apple | No Apple runner in this Windows workspace | iOS simulator/device, VoiceOver, native share/photo picker, signed candidate |
| Hosted | Access restored, 126 migrations match, scheduled Edge worker/monitor deployed, permissions and independent Realtime completion/correction pass | Confirm missing limits for seven historical matches; optional external alert routing |
| Upgrade/rollback | Previous committed SQLite schema and session pin tests | Physical/Play-installed upgrade; signed emulator 8 ? 9 ? 10 rehearsal passes with documented limitations |
| Pilot | Automated organiser/scorer clients complete the tournament | Real organiser/scorer pilot, defect triage and explicit acceptance |

The optional GitHub workflow runs isolated backend graph, scorer-driven tournament, statistics, large-schedule and three-browser Moments acceptance. PRs run build checks and browser smoke. Workflow files are prepared locally; a passing hosted CI run is not claimed.

Signed Android candidates have been produced and tested; broad native release still requires the missing gates. Record commit/source fingerprint, binary versions and SHA-256 hashes, backend migration/worker version, per-platform case reports and pilot decision. Do not announce rollout or mark UX-R8 accepted while the executable audit is blocked.
