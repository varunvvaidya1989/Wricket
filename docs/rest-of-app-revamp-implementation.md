# Rest of SportStage UX implementation

Started: 2026-10-12. Design source: `../../docs/UI Designs/wricket-rest-of-app/`
and `../../docs/WRICKET_REST_OF_APP_UX.md`. The eight completed domain rollout
phases remain complete; this is the subsequent presentation rollout.

| Phase | Scope | Status |
| --- | --- | --- |
| UX 1 | All-sports Now, My sports, Explore, sport switcher, match launcher and safe setup return | VALIDATED — uncommitted |
| UX 2 | Authentication, onboarding, profile, account, notifications and invitation acceptance | VALIDATED — uncommitted |
| UX 3 | Racket sport root navigation, home, My game, discovery, readiness and scoring presentation | VALIDATED — uncommitted |
| UX 4 | Public competition pages and separate organiser workspaces, rosters and fixtures | VALIDATED — uncommitted |
| UX 5 | Recovery, accessibility, Android device review, signed upgrade and release | PENDING |

`VALIDATED` means the implementation and its web acceptance checks passed in the
working tree. The domain roadmap reserves `COMPLETE` for committed work; no
commit or release is implied by this status. At the user's explicit request,
UX 1–4 were deployed to production web after UX 4 acceptance. Remaining native
release checks belong to UX 5.

Each phase requires comparison with the matching exported mockups, strict types,
lint and relevant regression tests. Before release, run `npm run build:check`.
Web review covers 320, 390 and 1280 pixel widths, direct refresh, keyboard input,
back navigation, authentication return, empty/error states and permissions.
Changes to scoring or management flows additionally require multi-client and
offline/reconnect checks against the existing local fixtures. Physical Android
and signed upgrade validation remain release gates; iOS is excluded at the
user's request. Do not treat web evidence as native validation.

UX 1 acceptance: one top navigation row on all-sports roots; named switcher;
matching palette, fonts, tile geometry and list spacing; live data with truthful
loading/failure states; discover filters preserve their route state; selected
match setup survives authentication and connecting the selected sport; existing
shared links and contextual scoring permissions remain valid. Following remains
reachable from My sports. The broader racket directory is completed in UX 3.

## Implementation log

- 2026-10-12: UX 4 implemented and web-validated. Commit: uncommitted working
  tree. Migrations: none. Public competition pages are separate from six focused
  organiser destinations. Entry and lifecycle decisions require review;
  scheduling preserves approved eligibility, registration locks, timezone and
  idempotency. Roster roles and unavailable states reflect actual access/data.
  Full production build gate passed: 906 tests in 157 files, lint, strict types,
  environment/architecture checks and 119 exported routes. Local organiser
  browser acceptance passed with zero page errors at 320/390/1280px, including
  actual registration, approval, denial, scheduling, failed-save retry, direct
  refresh and roster permissions. Temporary fixture resources were removed and
  sport preferences restored. Review corrected glyph encoding, palette, button
  typography, private-state retention, dialog scrolling and guest sign-in copy.
  Hosted review also corrected competition authentication return paths and web
  startup hydration. Preview `oamho42ghy` passed actual hosted sign-in, task links,
  guest access, offline/reconnect and export-byte comparison with zero page
  errors. Its scoped hosted fixture was removed. Expo throttled an earlier
  rapid check; the accepted check paced requests. The rejected preview was
  never promoted. [Review and screenshots](verification/REST-OF-APP-UX4.md).
  Production deployment `oamho42ghy` is live at sportstageapp.expo.app. Production
  acceptance also passed with zero page errors and matching export bytes;
  temporary hosted resources were removed. Rollback reference: `nw7ip46h5y`.
  Android, native interactions
  and signed upgrades remain UX 5 release gates.

- 2026-10-12: UX 4 started. Public competition pages and focused organiser
  destinations follow the approved designs while retaining existing permissions,
  entry eligibility, scheduling and lifecycle rules. Roster and fixture review,
  browser acceptance and the full build gate remain open.

- 2026-10-12: UX 3 implemented and web-validated. Commit: uncommitted working
  tree. Migrations: none. The user's scoring PDF supersedes the earlier scoring
  mockups for the five racket sports; cricket is excluded at their request.
  Stacked score cards, serving highlights, round previews, singles/doubles
  graphics, compact Undo and bottom actions retain existing scoring commands
  and permissions. Full build gate passed: 901 tests in 157 files, lint, strict
  types, environment/architecture checks and production export of 119 routes. Racket and
  connected-experience browser suites passed with zero page errors, including
  real creation, explicit server selection, scoring/Undo, live spectators,
  access expiry/restoration, reconnect/retry, completion and narrow layouts.
  Review corrected accessible labels, header/button typography, stale private
  state and the obsolete denial message after access restoration. Fixture
  preferences were restored; only newly created fixture resources were removed.
  [Review and screenshots](verification/REST-OF-APP-UX3.md). Deferred: public
  competition/organiser and roster-detail presentation (UX 4); Android, native
  sharing/haptics, signed upgrade and deployment (UX 5).

- 2026-10-12: UX 3 started. Review and implementation cover the five racket
  sport contexts, focused setup/scoring screens, discovery and real activity
  states. Existing scoring rules, permissions and synchronization remain the
  authority for these presentation changes.

- 2026-10-12: UX 2 presentation implemented and web-validated in the uncommitted
  working tree. Migrations: none. Full build gate passed with 885 tests in 155
  files and 119 exported routes. Local browser checks passed at 320/390/1280px
  with zero page errors, covering actual signup, onboarding, identity save,
  password change/recovery, notification permissions and captain invitation
  acceptance. Review corrected restored identity fields, safe callback task
  retention, stale private rows and notification failures. Sport photographs
  now retain their entire bundled frame on mobile with equipment icons.
  [UX 2 evidence](verification/REST-OF-APP-UX2.md). Deferred: tournament claim
  presentation within UX 4; hosted email, real data deletion compatibility,
  native media, Android and deployment within UX 5.

- 2026-10-12: UX 2 started in the existing working tree. Presentation follows
  the access/account mockups. Review includes recovery return paths, explicit
  public/private identity fields, truthful notification failures and existing
  sign-out/data controls. Deployment and Android validation remain UX 5 gates.

- 2026-10-12: UX 1 started in the existing uncommitted working tree. No migration.
  Review identified the legacy bottom navigation and a rejected match-setup
  authentication return path.
- 2026-10-12: UX 1 implemented and validated. Commit: uncommitted working tree.
  Migrations: none. `npm run build:check` passed: lint, strict types, 864 tests in
  154 files, environment/architecture checks and 119 exported web routes.
  `node scripts/e2e/verify-connected-experience.mjs` passed against the isolated
  local Supabase fixture with zero page errors. It covered three viewport widths,
  direct refresh/Back with search and filter retention, the actual authorised
  team detail route, guest-to-cricket-setup sign-in, connecting Badminton and
  returning to its setup, and a failed request/retry state. Connected sports were
  restored after testing. Live-card graphics were reviewed using a controlled
  response; no match or scoring event was persisted for that visual check.
  Review corrections: avatar circle, section labels, navigation inset, secondary
  button colours, framed Back control, equal sport columns, explicit accessible
  filter state, and limiting private directory requests to connected sports.
  [Review and screenshots](verification/REST-OF-APP-UX1.md).
  Deferred: account/access screens (UX 2), racket root shells and broader club/team
  discovery (UX 3), organiser screens (UX 4), Android and deployment (UX 5).

## Remaining coverage rollout

User authorization (2026-10-12): implement remaining work sequentially and deploy
each validated web phase to production before starting the next.

| Phase | Scope | Status |
| --- | --- | --- |
| Coverage 1 | Legacy archive list/detail and competition fallback | VALIDATED - deployed pdb79xgsdb |
| Coverage 2 | Remaining forms, dialogs and role-specific design comparison | VALIDATED - deployed hky6k7mpox |
| Coverage 3 | Web accessibility and recovery acceptance | IN PROGRESS |
| Coverage 4 | Hosted verification/recovery and account deletion compatibility | PENDING |
| Native gate | Android physical device, signed upgrade and pilot acceptance | PENDING |

A production web deployment does not validate a native release. Existing scoring
logic and permissions remain unchanged; gesture verification remains paused.

Coverage 1 (2026-10-12): uncommitted; no migration. 906 tests / 157 files, strict types, project checks and 119-route export passed. Focused lint passed after duplicate-import correction. Export, preview and production browser acceptance passed with zero errors and fixture cleanup. Visual review corrected screenshots captured under the launch overlay before acceptance. Deployment pdb79xgsdb; SHA-256 88627feed00270fe226bcdf768493ba3d16a8447e16b7e2d22e5c60e072891a1. Rollback oamho42ghy. Android unavailable; test inbox will be configured locally by the user. See verification/REST-OF-APP-COVERAGE1.md.

Coverage 2 (2026-10-13): uncommitted; no migration. Task-based help and standalone record link, explicit cancellable destructive-data review, repeat-request guards and organiser input typography. 83-state source/prior-evidence ledger reconciled. 906 tests / 157 files, lint/types/project checks and 119-route export passed; responsive export/preview/production acceptance passed with zero page errors and fixture cleanup. Corrections: stale exported input font, duplicate record header, friendly error expectations and a deployment bundle discrepancy resolved by fresh deployment/reacceptance. Production hky6k7mpox, SHA-256 a4bb30024966418a32f13bb285207b40d4cb27d9a6429e527446651fd3113175; rollback pdb79xgsdb. Actual account deletion, email delivery and unavailable Android remain open. See verification/REST-OF-APP-COVERAGE2.md.
