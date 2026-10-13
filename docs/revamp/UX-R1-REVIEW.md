# Phase 2 / UX-R1 review

Current implementation and acceptance updates (11 October 2026): see [the registration and phases 1–6 completion review](UX-R0-R5-COMPLETION-REVIEW.md). The older progress and blocker descriptions below are retained as dated history; they do not describe the newly completed atomic persistence, format/outcome matrix, registration or Android recovery work. Hosted rollout, iOS, paused native gesture calibration and physical-device accessibility remain explicit release gates.

Updated 27 September 2026. Status: implementation and browser acceptance complete; native release acceptance remains open.

## Implemented

- Now, My cricket and Explore are the root destinations. Collection pages return to My cricket; the old `/wricket` entry redirects to Now. Object IDs and scorecard deep links remain supported.
- Removed the Wricket bottom bar, profile drawer and tournament drag navigation. Tournament sections are Matches, Standings, Teams and Stats; About and owner-only Manage are explicit destinations. Match sections are Overview, Ball-by-ball and Scorecard; legacy summary/squads/insights parameters resolve to Overview.
- Live and terminal labels use shared presentation logic. Connection status is separate. Completed/abandoned matches do not receive a live dot. Root indicators are static and celebrations respect reduced motion.
- Actual authorised resume tasks, owned tournament actions, personal records, searchable teams/tournaments/people, collections and upcoming/recent match history use existing backend records.
- Organiser contact is absent from spectator presentation and share images. Safe tournament column grants and an owner-checked private RPC enforce this in the backend. Owner contact editing remains available.
- The browser PNG exporter uses the DOM capture path; native sharing keeps the existing native capture implementation. Export failures are visible and cancellation does not report an error.

## Visual reference

The source is `docs/UI Designs/wricket-revamp/styles.css`, `mockups.js` and the PNG exports in the parent workspace. Root layouts, About, the tournament identity/header, shared typography, buttons, cards, status labels and graphics follow that source. Example names, scores, dates and records are replaced with actual data. Missing records display empty states rather than demonstration figures.

Font-file comparison confirmed byte-identical assets already installed:

| Reference file | Installed face | Key use |
| --- | --- | --- |
| `space-grotesk.ttf` | `SpaceGrotesk_600SemiBold` | Wordmark 29px/-1.7px tracking; heading 27px/30.51px/-0.7px tracking; card title 16px |
| `inter.ttf` | `Inter_400Regular` | Reading text, 12px root tabs, 10px category chips |
| `ibm-plex-mono.ttf` | `IBMPlexMono_500Medium` | 9px eyebrow/1.1px tracking; 23px team scores; 9px overs |

Approved colours: background `#0b100e`, surface `#151c18`, raised `#1d2620`, border `#2a352e`, text `#f0f4ef`, muted `#a1afa4`, accent `#a6f477`, gold `#efcb7a`. Card radius 18px; primary-button radius 10px and height 46px; content inset 18px. `lib/wricket/presentation/design.ts` scopes these values to cricket. Other sports retain their theme. Outline SVG paths and team-crest geometry come directly from the approved prototype, without substituting a different icon family.

Full scoring, match-detail content, fixture/bracket administration, leaderboards and personal-performance layouts retain their own scheduled phases. Applying shared tokens does not certify their eventual screen-by-screen visual acceptance.

## Review corrections

1. Corrected the old app entry and restored create-tournament access.
2. Fixed collection Back behavior and explicit web selected-tab semantics.
3. Resolved cloud tournament IDs on cold links before loading local children.
4. Removed phone details from the actual share-poster content, not only its surrounding preview.
5. Replaced initial approximate typography/colours/icons with the approved assets and measured values after user review.
6. Replaced the narrow-screen search result target with a properly labelled row; preserved category filtering and real results.
7. Found and repaired browser PNG capture during a real export test, including native-resolution DOM capture and actual team counts.
8. Fixed overlapping cold-link hydration requests: concurrent requests share the same sync, forced retries queue after it, and failure releases the queue. The fresh spectator deep-link regression now passes.

## Validation and release boundaries

- Full build gate passed after design updates: lint, strict types, Vitest, environment/architecture checks and Expo web export.
- Isolated backend privacy integration passed for owner, non-owner and anonymous reads, owner-only contact RPC, owner update and rejected non-owner update.
- Browser runner: `node scripts/e2e/verify-cricket-navigation.mjs`. It passed at 376px, 320px and 1280px, plus a fresh viewer context. It checks actual search, object sections, contact absence, owner/viewer routing, computed heading typography and the 1080px PNG export. Artifacts are ignored under `.e2e/r1-screenshots/`.
- Migration `20260925143005_wricket_private_tournament_contact.sql` was generated by CLI local schema pull and reviewed. It is applied only to the isolated local stack; no hosted database was changed. Error-level local Supabase security advisors found no issues.
- Native device/OS share acceptance remains an outstanding release gate. Web viewport coverage is not a substitute for native acceptance. Phase 1 native/gesture checks were stopped at the user's request and are not marked passed.
- Deployment must coordinate the safe-column client with the privacy migration. Older clients requesting `organizer_phone` directly will be denied; reverting the UI must not restore public contact grants.

## Reproduction

Start the isolated stack and its existing fixture as described in `e2e/README.md`, then run `node scripts/e2e/verify-cricket-privacy.mjs --keep`. Start the app with `node scripts/e2e/serve-backend.mjs`, then run the navigation verifier. Run `npm run build:check` for the repository gate. Fixture cleanup includes only tournaments/matches/teams/accounts belonging to the isolated manifest.
