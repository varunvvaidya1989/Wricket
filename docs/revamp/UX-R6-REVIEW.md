# Phase 7 / UX-R6 review

Updated 11 October 2026. Implementation and local acceptance are complete. Hosted rollout and the full release platform matrix remain open; see [release readiness](UX-R8-RELEASE.md). This review supersedes the earlier atomicity and scorer-journey limitations in this file.

## Delivered behavior

The organiser workspace links actual teams/rosters, registrations, fixture plans, winning bracket, scorer access, details and sponsors. Tournament creation retains existing rules; Test asks for overs per innings. Player-pool registration, informational captain/icon/owner labels, manual payment status, placeholder captain claims and existing-team invitations are preserved. Captain/icon labels do not change scoring or allocation rules. AuctionYodha integration remains future scope.

Automatic scheduling supports groups-only, hybrid and knockout-only, with capacity/unassigned-team guards and review before generation. Manual stages, groups, fixtures, dates and venues preserve canonical match identity. Started/completed fixtures cannot be edited, removed or reset. Confirmed owner deletion of the whole tournament remains supported without weakening per-team/history protections.

Fixture plans, edits, schedules, resets and generated bracket rounds now use owner-authorised PostgreSQL transactions. Canonical matches are locked before fixture mutation; repeat commits reconcile by request hash and retained IDs. Random plans retain their ordering across ambiguous-response retries. Manual bracket projection is maintained by database triggers. The transaction tests cover rollback, denied writes, repeat requests and started-match guards.

All six supported presets and custom 2/4/8 paths persist and advance from actual winners/losers. Four-team playoffs route the first qualifier loser and eliminator winner to qualifier two. Six-team crossover chooses its direct finalist by group NRR. A review caught UUID sorting changing qualifier/eliminator and quarter-final seed order: projections now preserve the durable template's order, independent of canonical row order. Reset retains group results and rejects a started knockout.

Both tournament fixtures and organiser fixture summaries render at most 40 fixture cards per page, while paginated reads retain the entire schedule. A 64-team round robin produces and reads all 2,016 canonical fixtures. Manual scorer assignment/removal uses actual authority and explicit Keep/Confirm removal controls.

## Actual acceptance

- Full build gate: lint, strict types, 148 test files / 822 tests, environment/architecture checks and web export passed. Later release documentation/CI changes do not alter app behavior.
- `verify-fixture-plan.mjs` and `verify-manual-knockout.mjs` pass against the transaction-backed implementation, including 12/24-match review, custom reorder, canonical edit identity, guarded reset, unresolved-result blocking and champion.
- `verify-preset-backend.mjs` passes all five pairing strategies, six preset graphs, custom 2/4/8, repeat progression and 2,016-fixture read-back. These use arranged results as supplementary graph coverage, not scorer-journey evidence.
- `verify-tournament-complete.mjs` creates an eight-team tournament through organiser screens, assigns a separate scorer, scores twelve group matches, two semi-finals and the final through actual scoring screens, and verifies champion/standings/qualifiers and the original fifteen canonical IDs. The backend contains exactly 120 actual delivery events. Interrupted acceptance resumes the same journal and committed deliveries. The completed journey is retained for review; supplemental tournaments are cleaned up.
- The completed journey verifies all four leaderboard tabs, linked Performance/history, a fresh second-client view, and scorer removal cancellation/confirmation. `--review-only` rechecks the completed record without creating another tournament.
- `verify-large-schedule.mjs` verifies the first 40 and last 16 cards in both views, correct total count and 320px overflow handling.

Local evidence: `.e2e/r7-fixture-plan-transactions.log`, `r7-manual-transactions.log`, `r7-preset-backend-evidence.json`, `phases789-tournament-evidence.json`, `phases789-tournament-current-review.log`, `r9-large-schedule-evidence.json` and reviewed screenshots. Private fixture credentials are excluded from evidence exports.

## Design review

Reviewed organiser, manual fixture, qualifier review, bracket and champion states against the approved mockups. Shared Space Grotesk, Inter and IBM Plex Mono fonts, dark/green tokens and SVG graphics are retained. Standard two-to-one bracket transitions now use branching connectors; nonstandard ratios retain labelled arrows. Long team identities wrap and wide graphs scroll within the screen. Accessible controls remain at least 44px. Exact pixel parity across every state is not certified: qualifier chips/destination selection and some nonstandard bracket transitions differ from the prototype.

Previous focused reviews remain available: [team management](UX-R6-TEAM-MANAGEMENT-REVIEW.md), [tournament list/removal](UX-R6-TOURNAMENT-LIST-REMOVAL-REVIEW.md), [creation](UX-R6-NEW-TOURNAMENT-REVIEW.md), [registration](UX-REGISTRATION-REVIEW.md) and [team invitations/claims](UX-TEAM-ENTRY-REVIEW.md).

## Migration and rollout boundary

New transaction/deletion migrations `20261011034940`, `20261011041023` and `20261011044417` are applied to the isolated local database only. Their permission and rollback regressions pass. Applied migration SQL was not modified. Hosted audit still returns 403, so production deployment is not claimed. Native gesture checks remain paused by the user. Cross-platform release acceptance is tracked separately from this local phase completion.
