# Allocation, forms and application tracking review

Reviewed 10 October 2026. Registration phase 4 passes local SQL, browser and design acceptance. Release/native validation continues in phase 5. This does not close the earlier revamp acceptance gates.

## Delivered behavior

Organisers create pool placeholders and allocate approved registrations to teams in Manage → Registrations. Assignment and reassignment update the roster and account membership together. A full destination rolls back the move; only one competing allocation can take its final roster place. Unassignment removes the former roster/membership and makes withdrawal available again. Withdrawal or rejection of an allocated player is rejected on the server.

Captain and Icon are informational labels, displayed with the assigned team in the public pool directory. They do not set `is_captain`, grant captain membership, transfer ownership or enable roster management. Existing actual captain roles remain separate. Registration, player and team IDs are retained for future AuctionYodha integration; no auction engine is introduced.

The form editor supports up to eight required/optional text or choice questions. Server validation rejects unknown question IDs, missing required answers, invalid choices, nontext values and oversized answers. Questions lock after the first player or team application. Both current and legacy submission RPCs enforce requirements. Private answers appear only to the applicant and organiser, and never enter the public Players projection.

My cricket → My applications tracks both entry modes with review/payment status and navigation back to the correct tournament tab. Explore results indicate published open player registration or team applications. The player-pool team sheet presents placeholder creation and allocation guidance rather than reusable-club entry.

## Review corrections and permission checks

- New allocation and form tables have RLS, SELECT-only authenticated grants and checked mutations in private functions with empty search paths and invoker wrappers. Public allocation fields contain identifiers and informational labels, with private-tournament isolation. Form answers inherit existing private application policies.
- Corrected an ambiguous validation alias before applying the migration. Qualified policy references to the outer table; regression cases ensure that a different public tournament does not expose private forms/allocations.
- Allocation locks the configuration and registration, checks approval/mode/team identity and uses a single PostgreSQL transaction. Shared roster triggers enforce squad capacity, duplicate placement and approved pool allocation across legacy insertion paths. Removing a roster player also clears its allocation.
- Preserved actual captain permissions when editing information labels; moving an actual captain requires first removing that role through existing authorised tools.
- Reviewed the initial screenshots and simplified locked-form presentation and the application button. Shared 27/22/16 px Space Grotesk headings, Inter body/12 px fields, mono labels, 18 px inset, dark surfaces, green accent and 44 px controls are retained. Final 320 px captures show wrapping names and no horizontal overflow.
- Invitation URL generation now uses the configured Expo scheme, including the isolated native build identity, instead of forcing the production scheme.

Screenshots: [allocation controls](../../.e2e/participation-allocation-320.png), [public directory](../../.e2e/participation-directory-320.png), [My applications](../../.e2e/participation-my-applications-320.png).

## Evidence

- `npm run build:check`: lint/types, **134 files / 730 tests**, environment/architecture checks and web export passed. `.e2e/participation-build-reviewed.log` records this gate. Later native/link changes are included in the continuing release regression gate.
- Actual migration suite: **42 tests**, including 15 new allocation/form/privacy regressions. `.e2e/participation-sql-tests.log`.
- `node scripts/e2e/verify-tournament-participation.mjs`: final browser flow passed required text/choice questions, failed-write retention, private answers, form locking, allocation, informational labels without captain access, public directory privacy, tracking/navigation/reload, reassignment, unassignment/withdrawal and zero page errors. Concurrent real PostgreSQL allocation into the final roster place commits exactly one competing player. `.e2e/participation-e2e-reviewed.log`.
- Existing player-registration and team-entry browser regressions passed after the new migration/API integration, including privacy, failed-write retry, manual payments, invitation claims, expiry/revocation and competing claims/team approvals. `.e2e/participation-player-regression.log`, `.e2e/participation-team-regression.log`.

Migration `20261010124734_add_tournament_participation_and_forms.sql` is applied locally only. No commit or hosted database mutation occurred. The read-only hosted migration audit returned Supabase 403: the account lacks endpoint privileges. Deployment requires that access to be restored. Android validation now uses a separate emulator with sufficient storage and the isolated APK; iOS execution remains unavailable on this Windows host. Release validation and the earlier revamp pending-work tracker continue.
