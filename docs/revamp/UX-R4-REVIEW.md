# Phase 5 / UX-R4 review

Current implementation and acceptance updates (11 October 2026): see [the registration and phases 1–6 completion review](UX-R0-R5-COMPLETION-REVIEW.md). The older progress and blocker descriptions below are retained as dated history; they do not describe the newly completed atomic persistence, format/outcome matrix, registration or Android recovery work. Hosted rollout, iOS, paused native gesture calibration and physical-device accessibility remain explicit release gates.

Started 28 September 2026. Status: IN_PROGRESS. Earlier phase gates remain open; native gesture verification remains paused.

## Implemented

The scoring screen now opens a dedicated Match controls hub with five reviewed actions: penalty/bonus, retirement, scorecard review, early innings closure and exceptional match ending. The forms share the redesigned full-screen layout, fixed confirmation footer, accessible choices and visible error state.

- Penalty and bonus support the existing 1–6 run amounts, preview the resulting score and keep ball count and strike unchanged.
- Retirement explicitly selects the active batter and retired hurt/out, previews the wicket consequence and opens the replacement prompt only if the innings continues.
- Early innings closure shows the current score, remaining overs and target, then follows the existing next-innings/follow-on/completion decision. It no longer relies on a browser-incompatible native Alert to advance a follow-on decision.
- Exceptional endings distinguish walkover, no result and cancellation. Walkover requires one of the participating teams. The existing lifecycle command preserves history and existing outcome/points semantics.
- All confirmations use the same synchronous save gate as delivery entry. Success feedback follows command completion. Failures retain the form and block blind resubmission where a partial write may have occurred.
- Locally terminal matches redirect to the scorecard before scoring inputs are restored. Cold cloud links to terminal matches remain non-scoring under the existing hydration check.

## Design review

Compared the five screens to `mockups.js`, `styles.css` and exported mockups in `docs/UI Designs/wricket-revamp`. Corrected the initial bare icons to the approved 37px icon containers, caution/danger action cards, 17px mono adjustment keys, 45px green adjustment preview, selected-player cards and circular innings flag. Shared headings remain 27px Space Grotesk; supporting text uses Inter and figures use IBM Plex Mono.

Browser captures: `.e2e/r4-controls.png`, `r4-adjustment.png`, `r4-retirement.png`, `r4-end-innings.png`, `r4-exception.png`, and `r4-exception-320.png`. The local comparison page is `.e2e/r4-design-review.html`.

Production adaptations: names/scores/targets come from the match; the end-innings form omits the prototype's reason selector because the current command does not persist a reason. It does not pretend that an unused field is saved. The existing abandonment lifecycle's internal status mapping is preserved; no new state is introduced. This review is not pixel-perfect certification of every error, text-scale or format state.

## Verification

- Full build gate: lint, strict types, 123 test files / 575 tests, environment/architecture checks and web export.
- Browser command: `$env:WRICKET_E2E_CONTROLS='1'; node scripts/e2e/verify-cricket-match-start.mjs`.
- The local-backend journey creates its own canonical match and removes only that match afterward. It checks preview/cancel, penalty + bonus with no ball events, retired hurt and replacement, early closure and the next innings target, required walkover team selection and confirmed no result. It also verifies cloud event counts, a 320px footer, source font sizes and a terminal cold scoring link.
- Docker Desktop was restarted when the isolated backend engine was initially unavailable. No hosted database or deployment was changed.

## Remaining phase gates

- Atomic local event/totals/outbox persistence and explicit partial-failure recovery remain open. The UI guard is not a replacement for a durable transaction.
- Expand integration coverage to retired-out completion, both confirmed walkover winners, cancellation, follow-on enforcement/decline, multi-innings/tie-break formats, permission loss and denied roles.
- Verify terminal consistency across spectator, fixture, share and tournament read models; the current journey checks the scoring/scorecard path and authoritative cloud result.
- Complete visual acceptance of all decision/error states, long names, text scaling and native modal transitions. Phase 5 is not complete.
