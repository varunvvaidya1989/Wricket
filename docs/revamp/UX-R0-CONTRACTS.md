# R0 screen contracts and implementation prerequisites

Reviewed 25 September 2026 against application base `3ebd23c`. This is a mapping for implementation, not a certification of deployed permissions. Paths below are relative to `mobile/`; several mockup states share one production route.

## Coverage inventory

| Mockup IDs | Existing implementation home | Command/read contract and role | State ownership |
| --- | --- | --- | --- |
| `now`, `my`, `explore` | `app/wricket/(tabs)/index.tsx`, `my-wricket.tsx`, `search.tsx`, `live.tsx` | Existing discovery/search and personal readers; connected cricket account under RootAccessGate | Root navigation, resume and organiser tasks; future R1 contextual shell |
| `setup`, `players`, `toss`, `openers` | `app/wricket/match/new.tsx`, `components/sports/VirtualCoinToss.tsx`, scoring opening-role prompt | `matchSetupApi.createMatch/startMatch`; eligible team/roster/captain selections; existing creation/scoring authority | Setup/toss → IN_PROGRESS; no prewritten 7.2-over jump |
| `score`, `gesture`, `extras`, `wicket`, `offline` | `app/wricket/match/[id]/score.tsx`, `components/wricket/scoring/GesturePad.tsx` | Route `applyBall`, `lib/wricket/db/repo.ts`, scoring session restoration and `cloudScoringApi`; scorer only | Actual committed score and outbox state; domain-required next player/over/innings |
| `break`, `follow-on`, `end-innings`, `innings-closed` | Scoring route; `lib/wricket/app/innings-flow.ts` | `closeAndAdvance`, `planNextStep`, `startNextInnings`; existing scorer restrictions | NEXT_INNINGS, FOLLOW_ON_DECISION or COMPLETED, derived from real innings |
| `match-controls`, `adjustment`, `retirement` | Scoring route's settings/adjustment/retirement sheets | `insertScoreAdjustment`, `insertBatterRetirement`, session replay and queued event; scorer only | Preserve legal balls and figures; retirement may require replacement or close innings |
| `abandon`, `exception-ended` | Scoring route's exceptional-result commands | Existing match result/status and `MATCH_ABANDONED` sync semantics; scorer authority | Walkover/no-result/cancellation retained as distinct results; terminal read-only views |
| `overview`, `commentary`, `scorecard`, `result`, `match-info` | `app/wricket/match/[id]/live.tsx`, `scorecard.tsx` | Existing local/cloud readers, innings and public-authorised projections; spectator read access | Same canonical match/innings/status; all supported innings and corrections |
| `share`, `share-result` | Match live/result sharing and canonical link handlers | Existing permitted share/read projection; no operational contacts | Upcoming/live/break/final status must match source |
| `tournament`, `standings`, `teams`, `about`, `manage` | `app/wricket/tournament/[id].tsx` | `fixturesApi`, tournament sync/management, roster and organiser readers; operations remain authorised | Tournament ACTIVE/COMPLETED separate from match activity; no invented lifecycle |
| `new-tournament` | `app/wricket/tournament/new.tsx` | `createOnlineTournament` → cloud creation and local synchronization; organiser | Private contact required under existing validation; readiness is UI state |
| `fixtures`, `fixture-builder`, `group-builder`, `manual-fixture` | `app/wricket/tournament/[id]/fixtures.tsx`, `ManualScheduleBuilder.tsx` | Existing `fixturesApi` generation, manual stage/group/fixture commands and role checks | GROUPS_ONLY / GROUPS_THEN_KNOCKOUT / KNOCKOUT_ONLY; saved actual assignments |
| `knockout-builder`, `bracket` | Fixtures route and `lib/supabase/fixturesApi.ts` | Existing preset generation, seed order, progression, reset eligibility; organiser | Render actual chosen graph; stage eligibility and authoritative results |
| `scorers` | Tournament/fixture management | Existing fixture scorer assignment/revocation; organiser | Authority is granted/revoked by service, not merely a disabled button |
| `share-tournament` | `components/wricket/tournament/TournamentShareBanner.tsx` | Canonical tournament link and exported view; contact-safe projection needed | Same tournament state; no phone number or phone-bearing link |
| `stats`, `leaderboard` | Tournament stats view; `TournamentMvpLeaderboard.tsx` | `tournamentStatsApi`, `mvpApi.getCompleteTournamentLeaderboard`, local MVP reader; permitted spectator | Eligible completed matches, full-precision ranking, matches/POTM/point contributions |
| `performance`, `empty` | `app/wricket/(tabs)/stats.tsx`, performance components | Existing player record/period readers and linked-player flow | Actual scoped record versus loading/error/no-match; no fabricated zeros |
| `team` | `app/wricket/team/[id].tsx`, join/team components | Existing team/roster/join/invitation permissions | Readable identities and authorised management actions |
| `moments` | Tournament moments route; `components/wricket/moments/MatchMoments.tsx` | Existing `matchMomentsApi` and media permissions | Actual media, caption, empty/error and upload states |

All 48 mockup IDs appear above. The mapping preserves existing entry routes; introducing new presentation routes does not change canonical IDs or access rules.

## Contract decisions and blocking prerequisites

| Ticket | Finding / decision | Owning phase / gate |
| --- | --- | --- |
| R0-C01 | Two scoring modules coexist: `domain/scoring.ts` is used by the current route, while `domain/scoring/index.ts` exposes canonical replay/event APIs. Keep imports explicit. The reference ledger now checks both paths. UI extraction must not silently switch engines. | R3; review command/adapter parity before input changes |
| R0-C02 | Current Undo calls `deleteLastBall`, which orders balls by creation time and leaves adjustment/retirement tables intact. Existing cloud correction is ball-targeted. Canonical replay accepts ordered adjustment/retirement events, but that alone does not implement stored-event correction. Resolve ordering, eligibility, persistence and cloud correction in an adapter prerequisite; never have adjustment Undo delete an earlier ball. | R3/R4 blocker; full mixed-event correction is not implemented by R0 |
| R0-C03 | VirtualCoinToss clears results on caller/side change and offers repeat flips. Brief's landed-result lock requires a scoped component/setup contract and restoration behavior. No RNG, toss probabilities or unrelated sports rules change. | R2 before setup gate |
| R0-C04 | Real bracket presets live in `fixturesApi`, including PLAYOFFS_4 and SIX_TEAM_CROSSOVER; generic domain knockout generation alone is not enough. Preserve preset eligibility (including group prerequisites), actual graph and custom order. | R6 generation/progression tests |
| R0-C05 | Two four-team single round-robin groups produce 12 group games plus 3 semifinal/final games. Mock fixtures/counts/group membership are illustrative. Derive previews from the actual generated plan. | R6; real-service generation test pending backend |
| R0-C06 | `closeAndAdvance` returns NEXT_INNINGS/FOLLOW_ON_DECISION/COMPLETED. It cannot be replaced with a hardcoded final result. Default manual close is supported; arbitrary mock reason strings are not automatically persisted. | R4 closure adapter and multi-innings tests |
| R0-C07 | Canonical retirement tests now assert retained legal-ball count and zero bowler-wicket credit for retired-out. The actual route must show the selected active batter and restore replacement prompts from storage. | R4 persisted UI tests pending |
| R0-C08 | Public/shared rendering still includes organiser contact in TournamentShareBanner and detail contact access. Remove exported/read-only contact presentation and verify response projections/permissions with actual viewer roles. Hiding text alone is insufficient. | R1/R5/R6 privacy blocker until backend role evidence |
| R0-C09 | MVP reader already provides matches, POTM, batting/bowling/fielding and full precision. Keep them; metric selection must change actual ranking/units. Empty lists or failures must not render an invented podium. | R7 golden dataset/read-back tests |
| R0-C10 | Domain states: SETUP/TOSS/IN_PROGRESS/INNINGS_BREAK/FOLLOW_ON_DECISION/COMPLETED/ABANDONED. Tournament states ACTIVE/COMPLETED. Exceptional result and fixture projections must retain their own semantics. | R1 vocabulary and R4/R5 terminal links |
| R0-C11 | Accepted format enum: BOX, TURF, TURF_TEST, T20, T10, ODI. Existing overs/player/innings restrictions remain authoritative. UI examples must not hardcode seven players/two innings. | R2–R4 parameterized validation |
| R0-C12 | Compound runs/extras/dismissals remain atomic under current contracts; save success is not recognition. Haptics/receipts must follow persistence. | R3 failure injection and native input testing |

## Infrastructure blockers

- R0-B01: Docker startup is resolved after the requested WSL installation and Docker restart: WSL 2.7.14 and Docker engine 29.6.1 are verified. Local Supabase startup is downloading first-run container images; backend health/schema verification remains pending. Do not repoint tests at the hosted development/preview endpoint.
- R0-B02: `adb devices` reports no attached device/emulator. Maestro is not present on PATH. Android input, SQLite/process recovery and native smoke are not executed.
- R0-B03: This Windows host has no iOS runner. A Mac/EAS build runner and physical iOS acceptance are still required.
- R0-B04: Scoped account/match seeds, teardown and authenticated scorer/spectator E2E still need implementation and validation after B01 is resolved. The existing browser smoke intentionally stops at invalid auth input.

No backend migrations, remote record changes, schema changes, destructive resets, native deployments or production rollout were performed by R0's first implementation increment.
