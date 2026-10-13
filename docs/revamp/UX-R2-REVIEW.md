# Phase 3 / UX-R2 review

Current implementation and acceptance updates (11 October 2026): see [the registration and phases 1–6 completion review](UX-R0-R5-COMPLETION-REVIEW.md). The older progress and blocker descriptions below are retained as dated history; they do not describe the newly completed atomic persistence, format/outcome matrix, registration or Android recovery work. Hosted rollout, iOS, paused native gesture calibration and physical-device accessibility remain explicit release gates.

Updated 27 September 2026. Status: IN_PROGRESS, web implementation and integration coverage underway.

## Implemented

The setup route now opens with the approved “Less setup. More cricket.” readiness view. Teams, format, overs, squad size, date and venue are visible before roster selection. Tournament fixtures resolve cloud IDs on cold links and inherit locked format, overs, squad size and venue. Friendly matches keep those inputs editable.

The playing-sides view uses current hydrated team membership, auto-selects eligible players up to the match size, prefers registered captains, requires one selected captain per side and links incomplete teams back to their roster. The dedicated toss view uses the approved Space Grotesk/Inter/IBM Plex Mono typography, heading, mode chips, gold coin artwork and bat/ball icons. On-field entry is the default. Virtual mode requires an explicit caller and Heads/Tails call before flipping.

A reducer holds the landed result in the parent setup flow. Review, Back and route reload preserve the winner and decision in an account- and fixture-scoped draft; a landed result cannot be rerolled or switched to manual entry. Changing either participating team invalidates the old toss. The existing random coin implementation and match-start contract remain authoritative.

Match creation now carries a stable setup request ID. A private, pinned-search-path database function serializes concurrent retries and returns the original match for an identical request; reusing a request ID with changed details is rejected. Once the cloud match is created, the draft retains its canonical ID until setup succeeds. Editing match-defining inputs rotates to a new request. The existing transactional start RPC remains responsible for the XIs, toss, first innings and status.

## Review and validation

- Reducer regressions cover binding results, mode changes, required winners and participant invalidation.
- `node scripts/e2e/verify-cricket-toss.mjs` uses actual eligible rosters, verifies the explicit call, locked receipt across reload and review/back, and proves reviewing creates no match.
- `node scripts/e2e/verify-cricket-match-start.mjs` passes the standalone path through readiness, eligible XIs, toss, one canonical cloud match, opening roles and a real 0.0 innings; it removes the created test match.
- `node scripts/e2e/verify-cricket-fixture-start.mjs` passes a scheduled canonical fixture through cold-link hydration and verifies its ID and locked tournament conditions are preserved; it removes its scoped tournament fixture.
- `node scripts/e2e/verify-cricket-match-idempotency.mjs` submits concurrent identical requests to local Supabase, verifies one row and one returned ID, then verifies changed-payload reuse is rejected.
- Migration `20260927064528_add_idempotent_cricket_match_creation.sql` is applied to the isolated local stack. Migration history matches, and error-level local database advisors report no issues. No hosted database was changed.
- The initial green letter coin was replaced during review with the prototype's 132px gold radial artwork, 30px ball graphic and 10px mono caption. The heading and chips also use the source design values.

## Work remaining before Phase 3 completion

- Expand the eligibility/format matrix beyond the exercised three-a-side friendly and scheduled T20 fixture.
- Add explicit UI coverage for missing rosters, permission loss, offline recovery and server failure while retaining valid input.
- Verify keyboard and large-text layouts and run Android/iOS native acceptance. Native work does not include the stopped gesture-system verification.

This is the start of Phase 3, not certification of its complete E04-E06 gate. Gesture verification remains stopped as requested.
