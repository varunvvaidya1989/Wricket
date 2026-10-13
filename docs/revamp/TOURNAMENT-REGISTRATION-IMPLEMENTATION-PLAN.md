# Tournament registration and invitations

Approved scope: 10 October 2026. This extends the revamp; it does not close earlier outstanding acceptance checks.

## Product rules

- Entry mode is independent of cricket format: **Player pool & auction** or **Existing teams**. Existing tournaments default to Existing teams.
- Tournament creation remains private. Publication, accepting applications, and match lifecycle are separate decisions.
- Player registrations are separate from team rosters. Approval does not allocate a player or grant management access.
- Application review and payment flags are independent. An organiser may approve while payment is Pending. Wricket does not collect or verify payments.
- A public Players tab shows approved player registrations for Player pool, and participating rosters for Existing teams; application answers, contact details, payment flags and organiser notes remain private.
- Captain and Icon player labels are informational. The actual captain role controlling roster access remains separate.
- AuctionYodha integration is deferred. Initial allocations will be recorded manually with stable registration/player/team IDs.
- Entry mode locks when applications or tournament teams exist. Closed registration must reject new submissions on the server, including concurrent requests.
- A placeholder claim reserves that existing entry; a bring-your-team invitation creates a reviewed application. Expired and revoked invitations cannot be accepted.
- Owner-player permissions are not defined in this scope. Do not transfer ownership based on a player label.

## Delivery phases and review gates

| Phase | Deliverable | Acceptance gate | Status |
| --- | --- | --- | --- |
| 1. Foundations | Entry-mode selector, server registration configuration, separate publication/open controls, account-bound applications, privacy policies and migration | Existing creation stays compatible; private access denied; entry-mode locking and publish/open validation pass against actual SQL | COMPLETE — local acceptance |
| 2. Player applications | Explore → tournament → player form, own status/withdrawal, public Players tab, organiser approval/rejection and manual payment flags | Two accounts complete the flow; pending applicants stay out of directory; approval with pending payment works; retries cannot duplicate registrations | COMPLETE — standard form, browser acceptance |
| 3. Team entry and invitations | Captain submits a reusable team; organiser approves within capacity; placeholder claim links and general team-entry links, expiry/revoke and sign-in continuation | Claim never duplicates a placeholder; unauthorised captains cannot edit rosters; full/closed tournaments reject entry atomically | COMPLETE — local/browser acceptance |
| 4. Allocation and participation | Manual post-auction assignment, Captain/Icon information, application tracking in My cricket, discovery registration indicators and richer form configuration | Only approved pool players allocate; roster limits and duplicate allocation enforced; labels do not alter access; stable IDs prepared for future integration | COMPLETE — local/browser acceptance |
| 5. Release validation | Design review, browser end-to-end suite, native verification, privacy/permissions/concurrency review and regression checks | Both entry modes, invitations, review, payments, withdrawal, allocations and reload/retry pass; lint/types/tests/export pass; all deferred gates explicitly recorded | COMPLETE for local/browser/Android validation; hosted rollout blocked, iOS unavailable |

Each phase requires a code review and design review before it is marked complete. Browser screenshots at 320 and 376 pixels check typography, spacing, dark/green tokens and tab navigation. Native acceptance is a separate gate and must not be inferred from browser results.

## Initial implementation boundary

Start with the complete player registration slice across phases 1–2. Use a standard form with playing role, contact number and optional note; custom organiser questions follow in phase 4. All applications require organiser review initially. Existing-team creation and roster management continue through the current organiser tools until phase 3; do not display an inactive team application CTA.

Phase 3 now provides Existing teams applications, invitation links and the public roster directory. The initial phases 1–2 boundary above is retained as delivery history.

An account has one application per tournament in the initial slice. Rejected and withdrawn applications remain recorded; a new application or payment refund workflow is not included. Approved applicants can withdraw before allocation exists; phase 4 must add safeguards for allocated players before enabling allocations.

## End-to-end test matrix

1. Create each entry mode, preserve cricket format/overs/squad defaults and private organiser contact.
2. Publish without opening, then open; discover from Explore as another account.
3. Submit standard form; reject invalid role/contact, private/closed/wrong-mode submission, duplicate and forged account requests.
4. Applicant sees private status; organiser reviews; unrelated account cannot see submitted contact/note/payment or make changes.
5. Approve while payment Pending; approved name/role appear publicly without private fields or roster membership.
6. Mark Done/Pending; applicant sees flag, organiser audit actor/time preserved. Withdraw and reload; directory updates.
7. Close applications while retaining published tournament and approved directory. Lock mode after first application or team.
8. Invite/claim/approve existing teams, expiry/revoke/full capacity/concurrent claims and roster permissions (phase 3 local/browser gate passed).
9. In phase 4, allocate approved players, replace assignments, test limits and Captain/Icon labels against actual captain permissions.
10. Failed network writes and double taps, refreshed sessions, 320/376 px layouts, native keyboard/back/deep links, complete existing scoring/fixtures regression gates.

## Implementation log

- 2026-10-11: Phase 5 local validation completed. Final browser player and team-entry regressions, participation/privacy/concurrency checks, 42 actual SQL tests, native captain claim/delegated roster, player/team custom forms and application tracking pass. Design review covers shared fonts, source graphics, 320/376 px layouts and Android keyboard/back flows. The final build passes 139 files / 772 tests with lint/types/environment/architecture/web export. All three extension migrations remain applied locally only: hosted read-only audit returned 403 for missing endpoint privileges. iOS and physical/release-binary acceptance remain external gates. No commit or hosted rollout occurred. [Consolidated review](UX-R0-R5-COMPLETION-REVIEW.md).

- 2026-10-10: Phase 4 completed locally with reviewed allocation/reassignment/withdrawal constraints, informational labels, custom text/choice forms and private answers, My applications and Explore indicators. Migration `20261010124734_add_tournament_participation_and_forms.sql` applied only to the isolated local database. Actual SQL suite now has 42 tests; full build gate passed 730 tests; browser participation/concurrent allocation and both entry-mode regressions passed. [Design/code review](UX-PARTICIPATION-REVIEW.md). Phase 5 started, with a separate API 34 Android emulator and successful isolated APK installation. Hosted migration audit was denied with Supabase 403; no hosted mutation performed. Commit: none (working changes).

- 2026-10-10: Phase 3 completed for local/browser acceptance. Migration `20261010120051_add_tournament_team_applications_and_claims.sql` applied only to the isolated Wricket E2E database. Delivered general team-entry links, optionally account-reserved placeholder captain links, sign-in continuation, expiry/revoke, reusable-team applications and approval with current-roster copying, independent payment flags and a public-safe Existing teams Players directory. Actual SQL suite: 27 new tests. Full build gate: 134 files / 715 tests, lint/types/project checks/web export passed. Role-separated browser flow, failed-write retry, rejection/approval, concurrent claims/final-place approvals, withdrawal, player-registration regression and local security advisors passed. Reviewed 320/376 px fonts, spacing, icons and final screenshots. Commit: none (working changes). [Design/code review](UX-TEAM-ENTRY-REVIEW.md). Phase 4 allocation/labels/tracking/forms and phase 5 release/native validation remain open; no hosted rollout occurred.

- 2026-10-10: Plan accepted; foundations and player slice started. No hosted migration or production data changes authorised or performed.
- 2026-10-10: Foundations and standard player registration slice completed locally. Migration `20261010110748_add_tournament_registration_foundations.sql` applied only to the isolated Wricket E2E database. Actual SQL regression tests: 20 passed. Full build gate: 133 files / 686 tests, lint/types/project checks/web export passed. Browser owner/applicant/viewer journey, failed-submit retry, private directory projection, manual payment audit, withdrawal, closed-registration checks, concurrent duplicate submissions and existing Test/Turf creation regression passed. Design review corrected double padding, retained the 18 px inset and shared fonts/tokens, and checked 320/376 px screenshots. Commit: none (working changes). [Review evidence](UX-REGISTRATION-REVIEW.md). Phases 3–5, hosted rollout, native verification, custom questions, assignments and AuctionYodha integration remain open.
