# Phase 7 team-management review

Updated 10 October 2026. Team-management implementation and local browser acceptance: COMPLETE. Phase 7 as a whole remains IN_PROGRESS.

## Delivered

- Tournament Teams uses the approved grouped-directory hierarchy, shield crests, wrapping identities, actual roster counts and captain readiness. Saved group assignments drive the sections; unassigned teams stay visible. Owner capacity controls show available places without repeating the filled count.
- Owners can create a tournament team or enter an eligible existing team with its current captain and roster. Already entered teams are excluded. Existing server duplicate/capacity guards remain authoritative. Inputs survive a failed write; busy state prevents repeated submissions. Authenticated sync refreshes the local tournament cache after success.
- Team identity, the real current/upcoming match and playing roster follow the approved team screen. Live scores refresh through the existing subscription; terminal matches leave the on-field section. Stats/history remain accessible, and empty stats explain when a record will appear. Loading/unavailable activity is distinct from a genuine empty state.
- A separate roster sheet supports registered-player search, owner captain assignment, captain-only player addition, linked-account eligibility for captains, duplicate guards, keeper roles, removal confirmation and visible receipts/errors. Owners can remove players as the existing server policy allows. A remaining linked player can become captain after the previous captain is removed.
- Authority includes the team entity owner and tournament organiser for reusable entries. Captains cannot remove a captain. Removed captains and spectators cannot manage rosters; writes use the existing authorised RPCs.
- Captain invitations have a visible link and separate share action, exclude used/revoked/expired invitations, and can be revoked. Cold links retain their validated token through sign-in/onboarding. Acceptance remains a server-validated, one-use operation.
- Existing logo selection/upload remains available to authorised owners/captains. No new storage policy is introduced.

## Review corrections

- Removed double horizontal padding and repeated capacity copy from the team directory. Moved management controls out of the default profile so the crest/title, current match and avatar roster retain their design hierarchy.
- Checked shared Space Grotesk 27px headings, Inter inputs/captions, IBM Plex Mono labels, dark/green tokens, shield SVGs and initial avatars. Browser acceptance asserts rendered heading font/size and 320px document overflow. Screenshots were reviewed against `teams.png` and `team.png`.
- Fixed a missing private execution grant behind the security-invoker `set_team_player_keeper` wrapper. Authenticated calls now reach the existing owner/captain checks; anonymous execution remains denied.
- Removed the unsupported `TOSS` value from the cloud match-status query.
- Added `aria-checked` alongside native accessibility state for selection and keeper controls. The browser test caught a successful keeper write whose checked state React Native Web did not expose.
- Captures wait for the management modal to close. Tests match actual group-label text rather than CSS uppercase rendering and wait for server readiness before creating test data.

## Validation

- `npm run build:check`: lint, strict types, 131 test files / 646 tests, environment/architecture checks and web export passed.
- Four PostgreSQL/PGlite regression cases reproduce the missing grant and verify owner/captain updates, authenticated viewer denial and anonymous denial. Domain/API tests cover removed membership, role permissions, grouped/unassigned identities, actual counts and failed reads. Auth tests constrain invitation return paths to the expected 48-character hex token.
- `node scripts/e2e/verify-team-management.mjs`: passed using separate owner/captain/viewer browser sessions on the isolated local backend. Covers failed creation with retained input; create/reuse and copied roster; duplicate/capacity denial; actual groups; captain assignment; catalogue captain rejection; linked/catalogue player addition; duplicate membership; keeper save/accessibility; removal cancellation/persistence; unaffected source/unrelated rosters; captain replacement; removed-captain and viewer RPC denial; invitation revocation/cold sign-in return/one-use acceptance; stats/history; long names, fonts and 320px layout; live snapshot refresh and abandonment transition.
- Browser live snapshots/results are arranged test data. This does not certify scorer-driven tournament acceptance or E28. Cleanup deletes only the new tournament, its matches/stages, and its isolated reusable team/catalogue player.
- Evidence: `.e2e/r6-teams-build.log`, `r6-teams-e2e.log`, `r6-team-directory.png`, `r6-team-profile.png`, `r6-roster-management.png`, `r6-team-profile-320.png`, `r6-team-profile-live.png`.

## Deployment and remaining phase scope

`supabase/migrations/20261010085828_fix_team_keeper_rpc_permissions.sql` is required for keeper updates. Tested with PostgreSQL/PGlite and applied only to local `wricket-e2e`. No hosted database was modified. Apply it through the normal deployment process before rollout.

Native photo picking/upload and the OS share sheet were not retested in this slice. Exact parity across all team states and native accessibility/device acceptance remain part of release review; real counts/results and authorised controls replace scripted mockup data. Remaining Phase 7 scorer/preset/full-tournament acceptance and shared durability gates stay open. Native gesture verification remains paused.

## Follow-up: tournament entry removal

The organiser removal action and compact My tournaments collection are covered by [the tournament list/removal review](UX-R6-TOURNAMENT-LIST-REMOVAL-REVIEW.md). The new removal migration is required before hosted rollout, alongside the keeper grant migration above.
