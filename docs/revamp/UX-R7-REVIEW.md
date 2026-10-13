# Phase 8 / UX-R7 review

Updated 11 October 2026. Statistics, Performance and community implementation are complete. Local browser/backend and Android acceptance are recorded below. The release matrix and hosted deployment remain separate gates in [Phase 9](UX-R8-RELEASE.md).

## Statistics and Performance

MVP, Batting, Bowling and Fielding now render their actual discipline, units and eligible records. Expanded rows show full player/team identities, contribution points, player-of-the-match/top-three counts and linked match history. A discipline without actions displays its own empty state rather than reusing an MVP podium. Failed cloud reads have retry/error states; a successful empty response is authoritative. Partial MVP calculation coverage is labelled with the number of processed matches.

Personal and tournament figures use eligible completed matches, correction-aware event ledgers and explicit bowler-credit rules. Live, cancelled and no-result records do not inflate rankings. Multi-innings statistics distinguish innings IDs. All-time/current-year/last-year Performance filters query real calendar periods; request guards prevent an earlier response replacing the selected period. History links the actual scorecard and displays the opponent, date and recorded result.

Ordered paginated reads retain rows beyond Supabase's page limit. ID lookups are batched at 100 IDs. This fixes fixture/event/statistics read truncation; it is not a claim that every legacy directory supports an unlimited dataset.

## Authoritative MVP processing

A server-side worker uses the existing canonical MVP algorithm, not a duplicate formula. Service-role-only claim/finish functions lease a coherent match/XI/innings/event snapshot and atomically replace calculated rankings. Corrections or changed results invalidate prior rankings and leases; stale workers cannot overwrite newer state. Claims use skip-locked rows, bounded batches and expiry/retry limits. Realtime publication enables the existing authorised client subscriptions; focus/manual refresh remain available.

`node scripts/cricket-mvp-worker.mjs --local --once` exercises the local worker. Production requires an independently deployed server process and server-only credentials; neither a running hosted worker nor rollout is claimed.

## Moments and team flows

Moments has actual uploads, independent reactions/comments/reports, confirmed removal, match linking, highlight swiping and visible previous/next controls. Failed uploads retain the caption/photo and allow one successful retry. Browser attachment uses a real file input; native attachment retains Expo's photo permission/picker flow. Missing signed images show a useful author-labelled fallback. Focus and native pull-to-refresh reload the social feed without discarding an unsent caption/photo. A cold Moments route synchronises a missing tournament instead of leaving an empty screen.

Permission-checked social queries expose only visible authors' and commenters' display names. They do not grant profile/contact access, and removed/unrelated records remain excluded. Error notices are not duplicated across the page and confirmation modal. Existing team invitations, captain claims, roster management, registration and allocations retain their separate permissions and payment flags; earlier role-separated acceptance is linked in the Phase 7 review.

## Verification

- Full build passed: 148 files / 822 tests, lint, strict types, environment/architecture checks and web export.
- Worker PostgreSQL regression tests cover leases, superseded writes, corrections, permission boundaries and transactional failure. Statistics tests cover eligibility, periods, correction targets and attribution. Three display-name migration cases cover private/removed/unrelated records and contact exclusion.
- `verify-statistics-backend.mjs` passes actual owner and independent-reader APIs against a supplementary copy of the scorer ledger. Original totals are 14 runs / 8 balls, including 8 player runs / 0.8 batting points. A completed correction produces 10 runs / 7 balls and 4 player runs / 0.4 points across the calculated leaderboard, tournament statistics and personal history. Live/no-result exclusion and previous-year history pass. Admin-arranged correction scenarios supplement the actual scored tournament.
- `verify-tournament-complete.mjs --review-only` passes the retained fifteen-match record, persistent MVP on two clients, four disciplines, expanded points, Performance filters/history and scorer removal confirmation/cancellation.
- `verify-moments.mjs` passes Chromium, Firefox and WebKit: actual storage upload, retained failed-upload draft/retry, highlights, another user's reaction/comment/report, remove cancellation/confirmation, cold reload, unavailable-image fallback and 320px overflow. All three browsers use the approved canonical tournament sign-in continuation, retain error collection, and verify removal after authoritative reload.
- `verify-native-phases789.mjs` passes on the dedicated Android 14 emulator at font scale 1.3: the actual completed leaderboard, fielding empty state, Performance period/history and Moments composer navigation. This uses the existing debug APK with current Metro JavaScript; it is not a rebuilt signed release artifact. Font scale is restored and only the dedicated acceptance app is reset.

Evidence lives under ignored `.e2e/`: `r8-statistics-backend-evidence.json`, `r8-moments-*-evidence.json`, `r8-native-evidence.json`, `phases789-tournament-current-review.log` and reviewed web/native captures. Fixture passwords and auth-state files are not exportable evidence.

## Design review and boundaries

Reviewed the actual MVP podium/expanded row, Performance/history, Moments failure/fallback and Android large-text states against the approved leaderboard/performance/moments references. Space Grotesk/Inter/IBM Plex Mono, source name/caption/value sizes, discipline colours, gold winner podium, shared trophy/chevron graphics and dark/green surfaces are applied. Default expansion makes the record useful immediately. Full names wrap at narrow widths; action controls retain 44px accessibility targets. Native text scales with device settings. Whole-app pixel parity and physical screen-reader behavior are not certified by these captures.

Migrations `20261011041316`, `20261011042612`, `20261011042851` and `20261011050334` are applied locally only. Hosted access still returns 403. iOS, physical photo-picker/permissions, TalkBack/VoiceOver and the full cross-platform community matrix remain release checks. Native gesture verification remains paused.
