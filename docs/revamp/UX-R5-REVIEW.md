# Phase 6 / UX-R5 review

Current implementation and acceptance updates (11 October 2026): see [the registration and phases 1–6 completion review](UX-R0-R5-COMPLETION-REVIEW.md). The older progress and blocker descriptions below are retained as dated history; they do not describe the newly completed atomic persistence, format/outcome matrix, registration or Android recovery work. Hosted rollout, iOS, paused native gesture calibration and physical-device accessibility remain explicit release gates.

Started 28 September 2026. Updated 10 October 2026. Status: implementation and browser acceptance delivered; native and shared durability gates remain open. Phase 7 has started. Native gesture verification remains paused.

## 10 October acceptance update (supersedes the initial review below)

- Delivered live/result sharing, opponent identification, canonical links, recipient authentication return, clipboard copy and 1080px PNG export. Native share implementation is present but device acceptance remains open. Share fields exclude organiser contact; hosting has not been deployed.
- Completed match-info squad drill-down, real toss, right-aligned rules, linked venue graphic, real chase chart, innings-grouped commentary and all-innings scorecards. Added zero-ball non-strikers, retirement/re-entry and bowler-attribution coverage.
- `npm run build:check` passed: lint, strict TypeScript, 126 test files / 591 tests, environment and architecture checks, and web export.
- The extended independent-spectator browser journey passed against the isolated local backend: runs, undo, wicket, reload/reconnect, history hold/latest, innings transition, completed result, exceptional official result presentation, match info, scorecard, copied link, PNG export and recipient sign-in return. The script removes only its own test match. Exceptional outcomes are scoped test-data changes, not certification of the scorer controls.
- Reviewed the exported PNG (both teams, actual score/link, no private contact) and earlier overview/info/scorecard captures against approved references. Shared fonts and the 43px score are asserted. Comprehensive visual parity and native text scaling remain open.
- The isolated Android debug APK exists and its package ID was verified. Installation failed with insufficient emulator storage, including after cache trimming. OS share/cancel and native shared-link acceptance were not executed. iOS is unavailable here.
- Shared E24 fault-injection/persistence gates and earlier Phase 4/5 acceptance remain open. Browser acceptance does not certify process-kill/outbox retry or acknowledgement-loss recovery.

The sections below record the initial September implementation and its then-open work; the update above describes the current state.

## First implementation

- Fixed spectator score/status header and separate Overview, Ball by ball and Scorecard sections. Overview shows recorded batting figures, partnership and the latest valid delivery. Full squads, toss, rules and venue move into Match info.
- Reconcile undo by client event identity before deriving commentary and batting/bowling figures. Correction notices remain visible. Identical consecutive deliveries are not deduplicated.
- Match the innings snapshot by its innings ID when displaying totals. The independent browser test exposed stale 0/0 innings totals next to a correct 1/0 live header; this is corrected.
- Preserve the displayed history while browsing older events, with a New updates action. Guard stale asynchronous requests when navigating between matches.
- Remove the unsupported win probability from the visible Overview and replace speculative live prose with recorded facts. Missing toss and venue use explicit unavailable states.

## Browser verification

Static and unit checks: lint, strict TypeScript, 124 test files / 577 tests, environment configuration and architecture boundaries passed. The history tests cover undo identity, retained correction notices, event ordering and input immutability.

Command: `$env:WRICKET_E2E_SPECTATOR='1'; node scripts/e2e/verify-cricket-match-start.mjs`.

Passed against the isolated local backend: create a canonical match, open a separate authenticated spectator context, record 1 then 4, observe 1/0 then 5/0 without refresh, undo to 1/0, retain the correction notice and exclude the reversed four, open the corrected scorecard, and inspect real toss and squads. The test asserts the 43px Space Grotesk score and checks 320px horizontal overflow. It captures overview, commentary, scorecard and match-info screens. Only the newly created test match is removed afterward.

The first attempt kept the scorer in a background tab and did not propagate its pending write. Keeping the scorer foregrounded exercises the intended active-scoring journey; background sync remains a separate open acceptance case.

## Design review

Inspected approved `overview.png` and `match-info.png` alongside `.e2e/r5-overview.png`, `.e2e/r5-match-info.png` and `.e2e/r5-scorecard.png`. Shared Inter, Space Grotesk and IBM Plex Mono typography, green gradient score header, team crest, dark surfaces and three section tabs are applied. Overview now uses the approved batting rows and partnership hierarchy.

This is not full design acceptance. Remaining differences include the match-info squad drill-down, right-aligned rule rows, venue graphic when venue data exists, header share action, overview chart/latest-event card treatment, commentary grouping, and scorecard presentation. Missing play or venue data must not be replaced with the prototype's illustrative values.

## Remaining phase gates

- Live/result share preview, image export, canonical link handling, auth return paths and OS share sheets.
- Scorer-to-spectator innings break, completion and all exceptional outcomes; all-innings/format scorecard coverage.
- Exercise New updates and scroll preservation with a long history, correction while browsing, offline/reconnect and navigation races.
- Improve batting-role consistency: a non-striker without a faced ball is still listed as yet to bat in the legacy scorecard/squad renderer. Retirement/re-entry and replacement roles also need dedicated coverage.
- Full visual parity, long names, text scaling, native accessibility and transitions. Native gesture checks remain paused.

Phase 6 is not complete.
