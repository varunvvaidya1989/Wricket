# Phase 4 design review

Reviewed 27 September 2026 against `docs/UI Designs/wricket-revamp/mockups.js`, `styles.css`, and the exported Score, Extras, Wicket and Gesture screens. Status: implemented browser states reviewed; full phase visual acceptance remains open.

## Review scope and corrections

| Area | Source requirement | Implemented / reviewed |
| --- | --- | --- |
| Scoring header | Fixed compact score, left alignment, gradient, team crest | Corrected from the centered scrolling score; 43px Space Grotesk score and 29px wickets |
| Players and bowling | Compact two-player card, 16px mono figures; inline bowling | Removed surplus strike-rate columns and the separate bowling card |
| Delivery feedback | Receipt before Numbers/Gestures; cloud status distinct | Moved receipt above input; compact 8px mono connection row; real save/sync state |
| Numeric entry | Three columns; 28px Space digits; 52px keys; green boundaries | Browser assertions verify font, size, height and boundary background |
| Scoring actions | Extras, Wicket, Controls; separate Undo and History | Corrected positions and wired each action to the existing flow |
| Gesture presentation | 130px striped field, thin boundary and visible directional cues | Replaced legacy bright green pitch art; removed success-looking recognition feedback |
| Extras | Full-screen heading, radio list, stepper, preview, fixed footer | Implemented and captured after opening animation; 27px heading verified |
| Wicket | Full-screen dismissal form, details, notice, fixed footer | Implemented; corrected danger button to `#35221e` / `#ffb1a4`, rounded chips and 10px dismissal labels |
| Narrow viewport | No horizontal clipping | Numeric screen verified at 376px and 320px |

The review uses actual match data, so names, scores, overs and chase text differ from the illustrative prototype. Browser captures omit the prototype's decorative phone frame and OS status/home bars. The taller browser viewport puts fixed form footers lower than the exported phone image.

Production-specific adaptations are explicit: Wicket retains all seven supported dismissal choices and both batter choices; run-out retains separate wicket-breaker and assistant selection. Extras retains explicit strike-rotation confirmation for additional runs. Web receipts describe the current session because the web SQLite cache is ephemeral; native receipts describe device storage.

## Evidence

- Browser test: `scripts/e2e/verify-cricket-match-start.mjs` with `WRICKET_E2E_SCORING=1`.
- Captures in ignored `.e2e/`: `r3-numeric-scoring.png`, `r3-numeric-scoring-320.png`, `r3-extras.png`, `r3-wicket.png`, `r3-gesture-layout.png`.
- Local side-by-side comparison: `.e2e/r3-design-review.html`.
- Modal capture checks require the header to reach the top and the confirmation footer to be in the viewport. Earlier screenshots taken during the opening animation were rejected and replaced.

## Remaining acceptance gates

This is not pixel-for-pixel certification of every scoring state. Gesture hold progress and release-to-record six remain unimplemented; native recognition/interruption checks remain paused at the user's request. Error/offline/recovery states, every fielder/dismissal combination, long-name/text-scaling cases and all innings transitions still need visual and integration coverage. Existing opening-player and next-player prompts, Match controls and History destinations are retained; their complete redesign is not certified by this review. Phase 4 remains IN_PROGRESS.
