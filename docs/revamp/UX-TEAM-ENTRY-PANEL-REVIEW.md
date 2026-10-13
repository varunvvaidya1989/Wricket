# Tournament team panel correction

Reviewed 11 October 2026 following the reported Add Team panel mismatch.

The pool panel previously displayed a single-choice Create selector, described captain assignment as a roster-management step, wrapped eight colours into an uneven 6/2 arrangement, and placed its action inside scrolling content. Settings-read failures were only visible in the reuse view.

## Result

- Player pool: create an empty placeholder, then allocate approved players through Manage > Registrations. Captain/Icon remain informational labels. No reuse selector or captain-claim instruction appears.
- Existing teams: choose Create placeholder or Use existing team. A new placeholder can be claimed by a captain from Teams; reusable entry keeps the club's captain, keeper and roster.
- The colour picker uses four columns, two rows, 44 px touch targets, a source-icon checkmark and accessible selected states.
- Header and action remain outside the scroll area. The footer respects the bottom safe area and moves above the keyboard; the form scrolls in smaller windows.
- Settings failures show a retry notice and disable submission. Retries preserve the draft and selected colour; successful writes close before cache refresh to avoid duplicate creation.
- Directory copy no longer requires captain assignment for every team. Only claimable placeholders show Captain needed.

## Validation

`npm run build:check` passes lint, strict types, 139 test files / 772 tests, environment/architecture checks and web export. The focused `verify-team-entry-panel.mjs` runner covers settings and write failure recovery, both entry modes, actual empty-team creation, preserved club rosters, selected colours, 376/320 px widths and a 500 px viewport. Browser page errors: zero.

Android acceptance on the dedicated E2E emulator creates pool teams with the keyboard still open at font scales 1.0 and 1.3. Reviewed captures confirm the title, fields and primary action remain legible and reachable. The original font scale is restored and all runner-created tournaments are removed.

Typography uses the existing Wricket design tokens: Space Grotesk 22/26 title, Inter 13/20 body and inputs, Inter 11/17.6 captions. Colours and icons come from the existing theme and design-source assets. Browser screenshots and Android keyboard captures are retained under ignored `.e2e/team-panel-*.png` and `.e2e/native-team-panel-keyboard-*.png`.

This correction requires no database migration. It does not change the previously recorded hosted rollout, iOS, physical-device or paused gesture acceptance gates.
