# Phase 4 / UX-R3 review

Current implementation and acceptance updates (11 October 2026): see [the registration and phases 1–6 completion review](UX-R0-R5-COMPLETION-REVIEW.md). The older progress and blocker descriptions below are retained as dated history; they do not describe the newly completed atomic persistence, format/outcome matrix, registration or Android recovery work. Hosted rollout, iOS, paused native gesture calibration and physical-device accessibility remain explicit release gates.

Updated 27 September 2026. Status: IN_PROGRESS.

## Implemented

- A shared scoring deck provides Numbers and Gestures, with numeric 0/1/2/3/4/6 entry and Extras, Wicket and Undo actions. Both pads call the same existing delivery command. The local input preference survives reload without changing match data.
- Numeric buttons use the approved 28px Space Grotesk digits, 52px height, green boundary treatment, spacing and borders. Source review corrected the scorer to the compact 43px score and 29px wickets. Shared Inter text and source SVG icons remain scoped to cricket.
- The fixed score header, compact batting card and bowling row, over tokens, receipt above the selector, Controls action and separate Undo/History row follow the approved scoring composition. Extras and Wicket are now full-screen forms with explicit cancellation, previews and fixed confirmation footers. All existing dismissal types and fielder/assist requirements remain reachable.
- The command gate rejects overlapping saves while accepting intentional consecutive identical deliveries. Receipts and route success haptics follow completion. Saving disables input and player changes; errors retain extras/wicket drafts and prevent blind duplicate submission after a partial write.
- Undo works through a browser confirmation as well as native Alert. Removing the first delivery preserves opening roles.
- Cold scoring restoration fetches missing match teams using the signed-in client's existing RLS access. Effective history excludes corrected deliveries and preserves client event IDs, so subsequent Undo targets the original cloud event. Adjustment and retirement restoration reads the authoritative payload keys.

## Review and validation

- New unit regressions cover overlapping commands, consecutive identical commands, failed writes, preference fallback and correction replay identity.
- Browser runner: `$env:WRICKET_E2E_SCORING='1'; node scripts/e2e/verify-cricket-match-start.mjs`. Uses the isolated local Supabase fixture and deletes only its newly created match.
- Browser coverage includes first-ball Undo, consecutive boundaries, previews for all four extra types, a wide without a legal-ball increment, wicket cancellation/confirmation/replacement/Undo, mode preference and corrected score restoration, Undo after reload with cloud-snapshot verification, source design tokens and narrow layout.
- After the final style corrections, `npm run build:check` passed clean lint, strict types, 123 test files / 575 tests, environment and architecture checks, and web export. The expanded browser journey also passed on the final implementation.
- [Design review](UX-R3-DESIGN-REVIEW.md) records the source comparison, corrected mismatches, captures, functional adaptations and remaining acceptance gates.
- The first browser run exposed missing standalone team hydration on reload. Review then identified omitted correction replay and incorrect restored Undo identities; these were corrected before re-verification.

## Open phase gates

- Native recognizer calibration and gesture interruption verification remain paused at the user's request. The existing gesture recognizer is retained; release-to-record six and hold progress still need the planned implementation/review. Its static presentation now adopts the 130px striped field, boundary, cues and typography. Recognition no longer emits a success-looking flash/haptic before persistence.
- The full extras/dismissal matrix, explicit failed-save injection, offline/outbox recovery, multi-client parity and end-of-over/innings transitions need expanded integration coverage.
- Existing local ball/totals/outbox writes are not a single atomic transaction. The UI blocks on partial failure and directs the scorer to review history; durable command recovery remains open.
- The implemented browser states were reviewed against the source and exported designs. Unexercised scoring states and the native gesture interaction remain open; this is not a claim that every approved scoring state is complete.
- No hosted migration or deployment was performed. Phase 4 is not complete.
