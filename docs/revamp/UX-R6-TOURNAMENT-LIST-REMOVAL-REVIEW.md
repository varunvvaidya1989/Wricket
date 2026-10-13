# Tournament list and team removal review

Date: 2026-10-10. Phase 7 follow-up; the overall phase remains in progress.

## Changes and design review

- My tournaments now has one create action, a compact search field, active/past sections, compact tournament identities and wrapping names. Removed the duplicate neon action and fabricated striped cricket banner. Uploaded tournament banners remain supported.
- Uses the approved shared design tokens: 18px page inset, Space Grotesk 27px introduction and 16px tournament names, Inter 13px input/body and 11px metadata, IBM Plex Mono labels, dark surfaces and restrained green. Reviewed loaded 376px and 320px browser captures; long names remain fully visible with no horizontal overflow.
- The approved source has My cricket and tournament pages, but no separate tournament collection mockup. This collection extends their typography, cards and hierarchy; it is not claimed to be an exact reproduction of a standalone source screen.
- Organisers can open Manage → Teams & rosters → Remove team. The confirmation names the entry and describes the removed roster/invitations and retained reusable club/accounts/other entries. Busy controls prevent duplicate submissions; cancellation and failed writes retain the entry.
- Successful removal frees capacity and refreshes the directory. A successful bounded cloud identity read also removes stale unused cached entries after deletion on another device. Cached match history is retained, and absent entries are excluded from management/standings.
- Follow/unfollow, tournament navigation, retry and search remain available. Followed discoveries refresh the saved list. Failed initial reads expose an error and leave loading state.

## Database review

Migration: `supabase/migrations/20261010095815_add_tournament_team_removal.sql`.

The public security-invoker command delegates to a private function with an empty search path, explicit authenticated execution grants and a database check of tournament ownership. The command scopes the team to that tournament and returns the removed ID; the client requires that acknowledgement before removing its cache.

A delete trigger blocks canonical match history, generated fixtures and JSON bracket/progression references, including direct table deletes. It cleans group assignments and invalidates affected tie resolutions within the same transaction. Team roster/invitation records follow existing cascades. The reusable source team and its roster are retained. Existing foreign keys also retain restrictive historical references.

The migration was applied only to the isolated `wricket-e2e` local backend. No hosted database was changed. Deploy this migration before enabling the hosted removal control.

## Validation and evidence

- PostgreSQL/PGlite tests execute the actual migration: owner success; captain/viewer/anonymous denial; wrong tournament/source entry; repeated removal; group/roster cleanup; fixture references on either side; scheduled, live, completed and abandoned match history; bracket-only and progression-config references; direct delete protection.
- API regressions cover scoped command acknowledgement, failure propagation, bounded identity reads and failed-page protection.
- `npm run build:check`: lint, strict types, 132 test files / 666 tests, environment/architecture checks and web export. Final evidence: `.e2e/tournament-list-removal-build-verified.log`.
- `node scripts/e2e/verify-tournament-list-removal.mjs`: passed on local Chrome with separate owner/captain/viewer contexts. Covers single create action; rendered fonts; 320px wrapping/overflow; open/follow/unfollow; cancel/network failure/retry; source roster and account retention; capacity/group cleanup; reload persistence, including another context with a cached entry; fixture/bracket/completed-history denial; captain/viewer UI and server denial. Evidence: `.e2e/tournament-list-removal-e2e-final.log`.
- Local security advisors returned no issues: `.e2e/tournament-removal-advisors.log`.
- Re-ran `node scripts/e2e/verify-team-management.mjs`: passed creation/reuse, captain assignment/replacement, player/keeper changes, invitations, role denials, stats/history and live subscription/terminal transition. Evidence: `.e2e/tournament-removal-team-regression.log`.
- Reviewed screenshots: `.e2e/tournament-list-376.png`, `tournament-list-320.png`, `tournament-team-removal-confirm.png`.
- Browser fixtures/history are arranged test data. Cleanup deletes only newly created review tournaments, their stages/matches and the isolated reusable source. This does not certify scorer-driven tournament acceptance.

Native device/accessibility acceptance and the remaining Phase 7 full tournament/preset/durability gates remain open. Native gesture verification remains paused.
