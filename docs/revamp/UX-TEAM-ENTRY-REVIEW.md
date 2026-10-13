# Team invitations and placeholder claims review

Reviewed 10 October 2026. Registration extension phase 3 is complete for local/browser acceptance. Hosted rollout and native acceptance remain open; earlier revamp release gates are unchanged.

## Delivered journeys

An organiser can create a placeholder and invite its captain from Teams & rosters. The link can optionally be reserved for a registered account. A successful claim grants the actual captain's roster permissions on the same team entry, adds the captain to its roster and preserves organiser ownership. Claiming works during private setup and when all team places are already reserved. Replacing a claim invitation revokes the previous link.

For Existing teams, the organiser publishes and opens team applications in Manage → Registrations. Captains and club owners apply from the tournament's Teams tab or a general invitation link, selecting a reusable club and supplying contact details and an optional note. Sign-in preserves the invitation. Approval copies the current club roster and access into a separate tournament entry; the reusable club remains intact. Rejection can be reviewed again. Pending applications can be withdrawn with confirmation. Approved entries use the existing protected team-removal flow.

Payment Pending/Done/Not required remains independent of application approval. Payment collection is external. The public Players tab lists participating roster players with search and role filters; application answers, phone numbers, review history and payment flags stay private.

## Code and permissions review

- The migration adds invitations, team applications and private audit events. Tables use RLS and authenticated SELECT-only grants; mutations go through checked RPCs. Privileged implementation functions live in `app_private`, use an empty search path and expose invoker wrappers with explicit execution grants.
- Invitation tokens are random, stored as hashes and returned only when created. Public client reads cannot select the hash. Expiry, revocation, kind, tournament, optional target account and use limits are checked by the server.
- Claiming locks the placeholder and invitation, reuses the existing entry and rejects competing claims, existing captain replacement, full rosters and players already entered elsewhere. Ordinary players cannot manage the claimed roster.
- Applying requires a published, public, open Existing teams tournament, an eligible standalone club and current owner/captain authority. Nullable owner IDs do not bypass the permission check. A unique tournament/source-team constraint prevents duplicate requests.
- Approval locks registration configuration, application and source-team state, then checks capacity, active captain membership, squad size and player overlap. Concurrent approvals cannot take the same final place. The shared insertion trigger also covers legacy organiser entry creation. Repeated approval returns the existing entry.
- Invalid combined review/payment changes roll back the entry creation. Approval rechecks authority and the current source roster rather than trusting an application snapshot. Private contact and notes remain visible only to the applicant and organiser.
- Publication sync now preserves existing visibility when uploading local edits. New tournaments continue to use the database's private default. A regression test checks that editing a published tournament does not reset it to private.

## Design review

These new feature screens extend the approved Wricket revamp design system; there is no separate supplied invitation mockup. They use shared Space Grotesk headings, Inter body/fields and IBM Plex Mono labels, 27 px main titles, 22/16 px section titles, 13 px body, 12 px inputs, 11 px captions and 9 px overlines. The established dark surfaces, green accent, shared icons/team crests, cards and 18 px page inset are retained.

Reviewed 320 and 376 px invitation and application layouts, plus narrow organiser review and public roster views. Long names and links wrap without horizontal page overflow. Corrected the modal close control to the shared icon, cleared stale validation errors when fields change, retained entered values after failed submission, kept the invitation header fixed above its scroll area, and added keyboard avoidance. Full tournaments show a clear filled state and retain existing application status. Native keyboard behavior still requires device validation.

- [Captain invitation at 320 px](../../.e2e/team-entry-captain-invite-320.png)
- [Placeholder claim at 376 px](../../.e2e/team-entry-claim-376.png), [320 px](../../.e2e/team-entry-claim-320.png)
- [Team application at 376 px](../../.e2e/team-entry-application-376.png), [320 px](../../.e2e/team-entry-application-320.png), [lower form controls](../../.e2e/team-entry-application-fields-320.png)
- [Organiser application review at 320 px](../../.e2e/team-entry-review-320.png)
- [Public roster directory at 320 px](../../.e2e/team-entry-players-320.png)

## Validation evidence

- `npm run build:check`: passed, **134 test files / 715 tests**, lint, strict types, environment/architecture checks and web export. Log: `.e2e/team-entry-build-publication-reviewed.log`.
- The actual migration suite has 27 new SQL tests covering role/privacy enforcement, invitation lifecycle, claims, capacity, source roster checks, approval/payment atomicity and configuration locks. Invitation sign-in return-path regression also passed.
- `node scripts/e2e/verify-tournament-team-entry.mjs`: passed against the isolated local Supabase database in Chrome. Covers reserved-account denial, private placeholder claim through sign-in, same-entry ownership, real captain roster editing, team application validation, aborted-write retry, privacy, rejection then approval, payment audit, repeated approval, public Explore/full state and roster directory, revocation, closing, pending withdrawal and expiry. Actual PostgreSQL concurrent claims and competing final-place approvals produce one winner. No browser page errors. Log: `.e2e/team-entry-e2e-final-reviewed.log`.
- `node scripts/e2e/verify-tournament-registration.mjs`: player-pool regression passed, including application retry, payment/approval independence, privacy, concurrent duplicates, withdrawal and published visibility. Log: `.e2e/team-entry-player-registration-regression.log`.
- Local Supabase security advisors reported no issues (`results: []`). The CLI's stderr causes PowerShell to return a nonzero status; the advisory result body was inspected. Log: `.e2e/team-entry-advisors.log`.
- Full-suite execution initially exhausted resources running many SQL/WASM suites alongside Expo. Bounded Vitest workers to four; the full gate then passed with existing test timeouts unchanged.

## Rollout and remaining scope

Migration `20261010120051_add_tournament_team_applications_and_claims.sql` is applied only to the isolated local Wricket backend. No hosted rollout or commit was performed. Deploy the required migrations before releasing the client to a hosted backend; do not edit an already applied migration.

Native deep links, keyboard/back behavior, accessibility and release acceptance remain open. Phase 4 covers manual player allocation, informational Captain/Icon labels, My cricket application tracking and richer form configuration. Roster size/overlap are checked at entry approval and captain claim; consistent constraints on subsequent roster edits and allocated-player withdrawal must be completed with allocation work.

Rejected/withdrawn applications keep their unique record; creating a fresh application for the same club is outside this slice. Revoking a general link stops new submissions but does not cancel applications already submitted. A used captain link cannot claim again; the successful captain can reopen the team through My teams. Roster copying occurs at approval, with later tournament edits independent of the source club. Payment processing, refunds and AuctionYodha integration remain excluded.
