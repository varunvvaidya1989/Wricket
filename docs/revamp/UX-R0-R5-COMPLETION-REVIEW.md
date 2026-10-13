# Registration and phases 1–6 completion review

Updated 11 October 2026. Engineering and self-review: Codex. Changes remain uncommitted. This review supersedes the older open-work descriptions in the individual phase logs; those descriptions remain as delivery history. It distinguishes implemented behavior, passing acceptance and external release gates.

## Delivered and reviewed

- Registration now supports both entry modes, public discovery, account-bound applications, private custom text/choice answers, organiser review, independent external-payment flags, withdrawal, team invitations, reserved placeholder captain claims, delegated roster management and My applications. Approved pool players can be assigned, moved or unassigned within squad limits. Captain/Icon information never grants management access. AuctionYodha integration and payment collection remain outside this scope.
- Delivery, correction, adjustment, retirement and lifecycle commands write their event, totals, restore session and outbox in one SQLite transaction. Native commands use a separate connection with foreign keys enabled before BEGIN. Failure rolls back the command; receipts and upload start only after commit. Nested lifecycle commands reuse the transaction. The writer queue releases before callbacks that may create another command.
- Upload preserves event order and identity, handles lost acknowledgements and concurrent flush requests, and retains events after network/lease errors. Cold input entry checks server scoring authority and the device lease. Offline grants belong to the account and match previously authorised on that device; authoritative denials invalidate the grant.
- A profile transport failure retains the restored session. A native fallback permits only the previously authorised, locally saved, nonterminal scoring route. It does not grant offline access to tournament management or other sports. The root navigator remains mounted behind the launch boundary during auth restoration; scoring waits for restoration before loading or uploading.
- Cold links to completed or abandoned matches now resolve to the scorecard even when no local match exists. Hydration reads the authorised canonical match status before any scoring history; unstarted matches and permission failures remain errors.
- Follow-on decisions are reconstructed from cloud innings/rules after a fresh reload. Both enforcement and decline preserve canonical innings order. Final acknowledgement recovery uses stable lifecycle IDs.
- Setup now renders permission/network failures on web and native, retains review input for retry and blocks overlapping creation. Format selection exposes accessible radio state.
- The scoring pad implements hold progress and release-to-record six, cancellation/background gating and single input dispatch. Gesture callbacks execute on JS, where the shared scoring command and mutable interaction guards live. Native gesture calibration remains paused at the user's request.
- Converted source SVGs to UTF-8 base64 data URIs because the installed Android image loader did not render percent-encoded data URIs. This restores the approved icons, crests, coin, field and header artwork without replacing the design assets. Native invitation links respect the build's scheme and use the correct path form.

## Acceptance evidence

All artifacts below are ignored local files under `mobile/.e2e/`; they contain test data, not release credentials.

| Check | Passing evidence |
| --- | --- |
| Build and regression suite | `completion-build-verified.log` and `completion-build-exit.txt`: exit 0; lint, strict types, 139 files / 772 tests, environment/architecture checks and web export |
| Actual registration SQL | 42 PGlite tests in `tournament-team-entry-migration.test.ts`; local security advisors report no issues |
| Registration | `registration-final-regression.log`, `team-entry-final-regression.log`, `participation-release.log`: separate modes, forms/privacy, review/payment, auth continuation, retries, withdrawal, allocation/labels and actual PostgreSQL concurrency |
| Setup | `setup-matrix-reviewed.log`: all six formats, canonical rules, missing roster, permission denial and network retry without duplicate creation |
| Scoring forms | `scoring-form-matrix.log`: all four extras at zero/additional runs, explicit strike decision, server bat/extra/legal parity, every supported dismissal, non-striker run-out, required fielders/assist, replacement, Undo and next-bowler restoration |
| Controls/lifecycle | `controls-final-regression.log`, `lifecycle-matrix-completion.log`: adjustments, retired hurt/out, early end, no result/cancellation, both walkover winners, normal runs/wickets wins, tied result, terminal cold links, persistent follow-on enforce/decline, four completed innings and innings victory |
| Input permissions | `scoring-access-final-regression.log`: cold spectator denial, competing device lease, expiry/retry and denial despite a cached grant; no delivery writes |
| SQLite failures/reopen | 23 tests in `scoringTransaction.test.ts`: fault injection across writes, rollback/retry, database reopen, undo, FK enforcement, lifecycle ordering and outcomes |
| Upload/access recovery | Seven tests in `cloudScoringApi.test.ts`: order, lost acknowledgement, lease conflict, late flush race, account-bound cache and invalidation after denial and safe transport-error presentation with the outbox retained; seven offline-route boundary tests |
| Spectator/share | `spectator-final-regression.log`: independent client updates and Undo, reconnect, innings/result, 320 px layout, canonical link, recipient auth continuation and 1080 px PNG |
| Terminal cold links | Four `scoringHydration.test.ts` cases cover completed/abandoned match detection without private-history reads/cache writes, unstarted matches and authoritative denials; normal-result browser replay and terminal cold links pass in `lifecycle-matrix-completion.log` |
| Android registration/navigation | `native-wricket.log`, `native-participation-release.log`, `native-team-entry-release.log`: isolated auth, native back, invitation continuation, actual claim/roster role, player/team required answers, keyboard dismissal and tracking after approval |
| Android setup | `native-setup-reviewed.log`: Test, eligible club selection, six XI rows, numeric/text keyboards, on-field toss, one canonical match and correct two-innings rules at font scale 1.3 |
| Android durable scoring | `native-scoring-durability.log`: the scoring subset passed actual SQLite totals/session/outbox checks, process termination, another delivery while still offline, reconnect, outbox drain and three unique canonical delivery IDs. Its later share-stage failure was corrected and sharing retested separately; the whole historical run is not claimed to pass |
| Android controls | `native-controls-reviewed.log`: large-font native modals, non-ball bonus, retired-hurt replacement, end-innings cancellation and canonical no-result transition |
| Android sharing | `native-share-reviewed.log`: native link/image chooser, cancellation and a newly generated 1080 px PNG at normal and 1.3 font scale; large score/brand line heights corrected and exported pixels reviewed |

Test cleanup now uses local-session sign-out so a backend helper cannot revoke another browser or native fixture session. Native automation rejects stale window dumps and clipped descendants, and restores only the dedicated emulator's font scale. Failed early harness runs are retained as diagnostics, not passing acceptance.

## Design review

Compared against the existing HTML/CSS source and exported Wricket designs in the parent workspace. The implementation retains shared Space Grotesk, Inter and IBM Plex Mono fonts, dark/green tokens, 18 px insets, compact score typography, numeric button dimensions and source SVG artwork. Browser checks assert the 43 px score, 28 px numeric digits and 52 px numeric buttons. Android review also corrected the poster score/brand line heights, modal scroll height and top/bottom safe-area edges. Reviewed 320 px allocation, applications and public Players directory captures, Android claim, player/team application and application-tracking captures, and large-font Test setup, toss, opening-role modal, adjustment/retirement/outcome forms and the actual exported poster. Source gold coin/ball and field artwork render on Android. Long identities wrap; private form/payment/contact values stay outside the public directory and share projection. This evidence covers the exercised screens; it is not universal pixel-by-pixel certification of every device and state.

## Release constraints

- Migrations are applied to the isolated local database only. The linked hosted migration audit returned Supabase 403 (`LegacyDbConfigLoginRoleStatusError`), stating that the current account lacks endpoint privileges. No hosted mutation or deployment occurred.
- iOS execution requires an Apple runner unavailable on this Windows machine. Android uses the separate API 34 `Wricket_E2E` emulator on port 5556 and `com.vcreativestudio.sportstage.e2e`; the personal emulator and unrelated containers are retained.
- Native gesture calibration/interruption verification remains paused. Physical-device screen-reader assessment is separate from automated accessibility labels, narrow layouts and font-scale checks.
- Android process-termination/offline replay, OS share cancellation and large-font Test setup have passing local evidence. The emulator runs the existing isolated debug APK with the latest JS; this is not a rebuilt release-binary or physical-device performance certification. Live OS configuration recreation and release-binary acceptance remain device gates.
- Web SQLite is intentionally an ephemeral, cloud-authoritative cache. Native database durability does not imply browser offline persistence. Full Phase 7 tournament preset/scorer-driven rollout remains in its existing review scope.
