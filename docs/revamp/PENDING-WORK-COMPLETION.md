# Registration and revamp completion work

11 October 2026 follow-up: the reported Add Team panel mismatch is corrected and reviewed in [the team entry panel review](UX-TEAM-ENTRY-PANEL-REVIEW.md). Guidance now follows the tournament entry mode, colours use a consistent grid, and the primary action remains accessible with the Android keyboard open at normal and enlarged font scales.

Started 10 October 2026 at the user's request to finish registration work and all pending revamp phase 1–6 tasks. This tracker separates implemented behavior from acceptance evidence; an unavailable platform is not a passing check.

| Work | Current state | Next acceptance work |
| --- | --- | --- |
| Registration phase 4 | COMPLETE for local/browser acceptance; allocation, informational labels, tracking and custom forms | [Review evidence](UX-PARTICIPATION-REVIEW.md) |
| Registration phase 5 | Browser permission/privacy/concurrency regressions and Android player/team/claim/roster journeys pass | Hosted rollout blocked by 403; iOS unavailable |
| Revamp phase 1 / UX-R0 | Isolated seed/cleanup/backend journeys, Android auth/back/navigation and durable scoring verified | Native gesture spike remains paused; iOS unavailable |
| Revamp phase 2 / UX-R1 | Browser privacy/navigation/export and Android navigation/share pass; native source graphics, typography and safe areas reviewed at font scale 1.3 | iOS and physical-device release acceptance remain open |
| Revamp phase 3 / UX-R2 | All six formats, eligibility, missing roster and permission/network retry pass in browser; Android Test creation, XIs, keyboards, on-field toss and font scale 1.3 pass | iOS and physical-device release acceptance remain open |
| Revamp phase 4 / UX-R3 | Atomic persistence, rollback/reopen, ordered/idempotent upload, all extras/dismissals/Undo/over prompts and Android cold offline/process-kill replay pass; hold progress/release six implemented | Native gesture calibration paused; iOS unavailable |
| Revamp phase 5 / UX-R4 | Atomic controls/lifecycle, retired hurt/out, both walkover winners, cancellation/no result, follow-on enforce/decline/reload, normal runs/wickets wins, tied result, fourth target and innings victory verified; large-font Android control modals pass | Physical/iOS visual and interaction acceptance remain separate |
| Revamp phase 6 / UX-R5 | Independent spectator parity/reconnect/result and browser share pass; Android reconnect proven; source SVG rendering and score clipping fixed | Native chooser/cancel/new 1080 px image pass at normal and 1.3 scale; iOS/physical release gates remain open |

Android work uses a separate `Wricket_E2E` API 34 emulator on port 5556. The existing Pixel_7 device and unrelated containers are retained. The isolated APK installed successfully; iOS execution requires an Apple runner unavailable on this Windows host. Hosted rollout is checked independently of the local database.

The hosted read-only migration audit returned Supabase 403 (`LegacyDbConfigLoginRoleStatusError`): the current account lacks the necessary privileges for the endpoint. Hosted rollout is blocked by access, not marked complete. Local/browser/Android acceptance is recorded independently in the [completion review](UX-R0-R5-COMPLETION-REVIEW.md).

## Review log

- Registration migration review found ambiguous SQL aliases and an outer-column qualification risk in new policies; corrected before applying locally. Actual SQL tests now include private-form/allocation isolation when a different tournament is public.
- Allocation is transactional, rejects unapproved and cross-tournament assignments, retains the original assignment after a failed full-team move, and blocks approval changes/withdrawal until unassigned. Captain/Icon labels never change actual team roles. Roster guards cover legacy insertion APIs as well as new allocation.
- Custom forms support up to eight text/choice questions, enforce required/known/bounded answers on both entry modes and legacy submit RPCs, lock after the first application and keep answers out of public projections.
- Browser/design review simplified locked-question presentation and application navigation, removed reusable-club entry from the pool team sheet, and checked narrow layouts against shared Wricket tokens.
- Durability review replaced partial scoring writes with transactions, enabled native FK enforcement, deferred UI/network effects until commit, fixed the late-flush race and added real SQLite fault/reopen tests.
- Expanded browser acceptance covers every supported extra and dismissal, next-bowler restoration, denied cold links, competing device leases and persistent follow-on decisions.
- Android review found missing percent-encoded SVGs, a root navigator hidden during cold auth restoration, profile-outage loss of the restored session, a blocking transport-stack alert and clipped oversized text. Each has an implementation correction and targeted verification in the [completion review](UX-R0-R5-COMPLETION-REVIEW.md).
- Android actual SQLite evidence proves that an offline delivery survives process termination, scoring resumes while the API is still unavailable, and reconnect uploads the retained deliveries once. UI receipts follow committed local state; a successful browser export is not used as native durability evidence.

- 2026-10-11: Final build gate passes 139 files / 772 tests, strict types, lint, environment/architecture checks and web export. Final browser registration, invitations, scoring-authority, controls and spectator regressions pass. Android Test creation and native control modals pass at font scale 1.3; sharing passes native chooser/cancellation and new 1080 px PNG checks. Cold terminal scoring links exposed a hydration rejection and now return to the scorecard without reading scoring history. See the consolidated review for final outcome evidence and external gates.
