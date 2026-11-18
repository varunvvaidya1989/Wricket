# Android Google Play production-access and release plan

Prepared 14 October 2026. Status: EXECUTION IN PROGRESS; Android production release is not approved. The initial audit was read-only; subsequent authorised changes are recorded in the [execution tracker](release/ANDROID_RELEASE_EXECUTION.md).

## Assessment

The user's screenshot shows a production-access rejection, reviewed September 25, stating that more testing is required. It does not identify a specific app-policy violation. The user reports 14-15 testers, with only some using the app. Limited tester engagement is therefore the leading explanation, not a proven diagnosis of Google's private review decision. Qualifying continuous opt-ins, previous application answers and current Console status remain unverified.

The immediate priority is genuine Android closed testing and a factual account of what was learned. More UI redesign or another web deployment alone will not resolve this gate. Google's applicable personal-account requirement is 12 testers continuously opted in for 14 days. Google also evaluates the testing account provided in the application; no official daily session or minutes-used threshold is published in the cited guidance. [Testing and production-access guidance](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en).

Use the existing 14-15 people first. Confirm 12 who can carry out assigned tasks; keep the remaining people as backups. If fewer than 12 can participate, recruit a small number of actual local organisers, scorers and players. A larger buffer is useful, but 20 testers is not a Google requirement. Installation and continuous opt-in are separate from active testing.

## Evidence reviewed and gaps

| Priority | Finding | Evidence and practical consequence |
| --- | --- | --- |
| P0 | Closed-test engagement is insufficiently demonstrated | User reports inactive testers. No dated role-based sessions, feedback-to-fix record or previous application answers were supplied. Opt-in continuity must be checked in Console. |
| P0 | Latest source has not been accepted as an Android Play release | Web gate passed 939 tests and 39 representative production browser states. Those do not certify an Android binary. October 11 signed versions 8, 9 and 10 were exercised on an Android 14 emulator, before the latest account/recovery redesign. |
| P0 | Current physical/Play-installed upgrade evidence is absent | Existing signed rehearsal used EAS credentials and an emulator, with documented baseline cold-sync/offline limitations. Play App Signing can use a different certificate. The previous phone was unavailable. |
| P0 | Release instructions conflict with submission settings | `docs/google-play-release.md` describes version 1.0.0 and internal/draft. Current app is 2.0.0; `eas.json` submits to `alpha` with `completed`. Reconcile before any upload. Track names must be matched to the actual Console track. |
| P0 | Native links need repair and acceptance | App config registers sportstageapp.com; the public apex currently returns a /lander placeholder and assetlinks.json is not valid association JSON. Native invitation and recovery callbacks need explicit testing. |
| P0 | Deletion completion/support is not established for shared-history accounts | Fresh-account deletion with avatar/retry passed on web. Restrictive shared sport references deliberately block automatic deletion; the UI tells users to contact support but no direct support action was found in that flow. Define and exercise a request/completion path. |
| P0 | UGC safeguards are incomplete in the searched source | Moment reporting/removal exists. No user-report/user-block interface or terms-acceptance mechanism was found in the searched app/source. Review public moments/comments and other UGC; either complete applicable safeguards or explicitly scope those features out of the submitted build. This is a source audit, not a finding from Google. |
| P0 | Audience, privacy and ad treatment need reconciliation | The public policy allows supervised youth sport; the native ad component hard-codes child-directed and under-age flags to false. Decide actual audience and implement appropriate treatment; do not misdeclare an adult-only audience just to simplify review. |
| P1 | Ad serving is not ready to rely on | app-ads.txt is missing/incorrect at the checked hosts. Release builds use a live ad unit because `__DEV__` is false; register test devices or implement an explicit test-ad configuration for testing. This is distinct from the insufficient-testing rejection. |
| Verify | Final AAB API/permissions/native compatibility unknown | Installed RN build defaults target API 36, consistent with current submission requirements, but only the submitted AAB's manifest proves this. Inspect merged permissions, native libraries and 16KB operation. |
| Verify | Reviewer access is not established | Confirm reusable reviewer accounts, role permissions and sample records in Console. Do not depend on access to an inbox, expiring invitations or real-world payments. |
| Verify | Latest backend/pilot readiness has outstanding historical evidence | Earlier rollout notes recorded historical innings-limit remediation and pilot/monitoring gates. Recheck their current status rather than treating old notes as fresh verification. |

The public privacy policy at https://www.sportstageapp.com/privacy is accessible and includes an email deletion request to admin@sportstageapp.com. A dedicated /delete-account route returned 404, but a separate page is not inherently required when a prominent functional policy/email request route exists. Mailbox delivery, request handling and the exact URL entered in Data safety remain unverified; the user previously deferred email testing. The policy's deletion navigation and retention wording also need to match the current app and actual handling. [Deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en).

Local `android/` is generated E2E output: its package/scheme are SportStage E2E and release config uses the debug keystore. It is ignored by Git; no .easignore overrides were found. This does not establish that cloud production builds have the wrong identity. Inspect the production upload archive and actual AAB; never submit an APK/AAB from this local E2E tree as production.

The public listing returned 404 in the India check. That can be expected before production access; it is not evidence of a policy failure. Testers must use the closed-test opt-in/install link, not search for a public listing. Public HTTP evidence is in [the audit report](verification/ANDROID_PLAY_PUBLIC_AUDIT_2026-10-14.json).

## Phased execution

| Phase | Work | Owner | Exit gate |
| --- | --- | --- | --- |
| A: Console baseline, 1 day | Save rejection email/screenshot and previous answers. Confirm account type, qualifying opt-ins, track, test URL, current AAB/version and pre-launch report. Identify 12 willing testers and backup people. | Release owner | Private Console evidence and a committed tester roster; no inferred counts. |
| B: Release blockers, approximately 2-5 days | Repair links; reconcile build/submission instructions; implement applicable UGC/terms controls, deletion support and audience/consent treatment. Complete the SDK/data inventory and current policy copy. Prioritise actual user blockers over cosmetic changes. | Engineering + product/privacy owner | Every P0 issue resolved or feature genuinely excluded from release scope, with a reviewed verification record. |
| C: Candidate and internal test, approximately 2-3 days | Freeze release scope/revision, run full gate, produce production AAB with existing upload identity and incremented version, inspect it, upload to the intended internal track and install through Play. | Release engineer + QA | Correct package, signing relationship, version, backend, API, permissions and native compatibility; fresh-install and upgrade tests pass. |
| D: Closed test, at least the qualifying 14-day window | Keep testers opted in; assign realistic role-based tasks, collect feedback, fix issues and retest on Play-delivered updates. Continue testing beyond minimum eligibility when evidence or quality is weak. | Test coordinator + testers | Dashboard eligibility plus completed role coverage, repeat sessions and feedback/retest record. |
| E: Application, approximately 1 day | Write answers from actual cohort and results. Explain recruitment, real usage, feedback, changes and readiness with dates/versions. Supply reviewer access. | Product + release owner | Reviewed truthful application; no invented sessions, feedback, numbers or promises. |
| F: Review period | Keep cohort active, accounts working, backend available and feedback channel monitored. Follow any further Console testing instructions. | Release owner + coordinator | Production access approved; approval itself does not publish the app or prove subsequent app review success. |
| G: Production submission and launch | Complete app-content declarations and accurate listing, submit the accepted candidate to production after access approval, retain release control and monitor launch. | Release owner | App release approved, Play install verified and operational support ready. |
| H: First-week operations | Monitor crashes/ANRs, login failures, scoring loss/duplication, sync lag and deletion requests; triage reports daily and verify fixes. | Engineering + support | Stable first week; documented incident and recovery handling. |

Suggested planning allowance: 3-5 weeks after participating testers and blocker fixes are available. This is an estimate, not a Google approval guarantee. Readiness, Console eligibility and any rejection-specific instructions govern timing. A fresh two-week exercise is recommended for this substantial redesign; do not claim that every app update automatically resets opt-in eligibility.

## Android candidate acceptance

Record source commit plus working-tree fingerprint, EAS build ID, AAB SHA-256, version code, package, upload certificate, Play signing certificate and Play track. The next version must exceed all relevant uploaded versions, not just the local versionCode 7 or the last documented version 10.

Inspect the release AAB for `com.vcreativestudio.sportstage`, non-debuggable status, production HTTPS backend, no E2E flags/localhost, release signing, ABI support and merged permissions. Validate target API 36 against the current requirement. Review native libraries and 16KB alignment/runtime rather than assuming React Native dependency defaults prove compatibility. Current Android documentation has revised update-enforcement dates; check the app-specific Console message rather than relying on an old deadline. [API policy](https://developer.android.com/google/play/requirements/target-sdk), [16KB guidance](https://developer.android.com/guide/practices/page-sizes).

Exercise at least three physical devices across vendors, including a lower-memory device; use current Android 15/16 emulator/device coverage and a 16KB environment as supplements. Include large text, TalkBack, keyboard/Back behavior, portrait/landscape, edge-to-edge, long scoring sessions, weak network, battery saver and permission denial. This device count is our QA recommendation.

| Area | Required journeys | Evidence |
| --- | --- | --- |
| Access | Fresh install, signup/verification, sign-in, recovery in cold/warm app, failed/expired link, return to intended task, sign-out and subsequent account | Play build/version, recording, actual delivery/callback result |
| Cricket | Create tournament, pool vs team entry, placeholder/captain claim, roster, fixture/manual scheduling, qualifiers/bracket progression, numeric scoring, penalties/bonus, innings ending, abandonment, Undo/corrections, standings/stats | Role and permission matrix; independently checked score/event history |
| Racket sports | All five released sports; singles/doubles as supported; serving/receiving, game transitions, Undo, point details, completion, spectators | At least one completed match per released sport; representative two-device doubles/scoring checks |
| Network | Queue scoring offline, force-stop/reopen, resume pending batter/bowler prompts, reconnect, access revocation and scorer handoff | Same event IDs delivered once; no loss or duplicate score; spectator convergence |
| Upgrade/recovery | Play-installed previous version to new version without uninstall/data clear; active match, queued scoring and prompt retention | Before/after data plus UI; forward recovery build with higher version code |
| Media/notifications | Picker selection/denial/cancel, uploads, share sheet, notification/invitation destinations; distinguish in-app notifications from push | Real device records; do not advertise unsupported push behavior |
| Privacy | Private contact isolation, anonymous/other-role denial, deletion with avatar, deletion with shared records, support request completion, report/block enforcement | Controlled accounts and data; moderator/support processing record |
| Ads | Consent accept/decline, privacy options, audience treatment and no accidental live-ad test traffic | Test-device configuration and consent/SDK trace |

Gesture verification remains paused by the user's prior instruction. Do not mark it passed. Before a release that includes it, either separately authorise validation or make an explicit product decision to exclude the unvalidated capability from the release. No gesture test or feature removal is performed by this plan.

Email delivery stays pending now, as requested. It becomes an Android release gate when signup, verification or password recovery depends on it; do not treat administratively generated web recovery tokens as delivery proof.

## Practical closed-test programme for the existing cohort

Use 12 primary participants: two organisers, four scorers, four captains/players and two spectators. The other two or three people can cover absences or device diversity. People can rotate roles; these allocations are a suggested test design, not a Google quota. Recruit through actual sports activity if current participants cannot engage; recruitment messages are not sent by this task.

Each participant installs from the correct closed-testing Play link, confirms the version, remains opted in and completes meaningful tasks with feedback. Schedule initial, follow-up and regression sessions rather than asking people to repeatedly open an unused app. Record the real sessions; there is no claimed mandatory daily-use count.

| Window | Planned exercise | Feedback and completion |
| --- | --- | --- |
| Days 1-2 | Install/onboard; choose sport; organiser creates competition; captain/player joins; spectator locates it | Installation friction, navigation, device details, role assignment |
| Days 3-5 | Cricket tournament workflow and one real/simulated completed numeric-scoring match; invite/claim/registration review | Confusing fields, scoring accuracy, permissions, independent spectator observations |
| Days 6-8 | Racket singles/doubles coverage across released sports; weak-network and offline-resume exercises | Serving/Undo/results, sync behavior, readable layouts and interaction problems |
| Days 9-11 | Ship genuine fixes; update through Play; repeat failed cases and conduct multi-device scoring | Issue -> fix version -> named pseudonymous retester -> result |
| Days 12-14 | Return sessions, tournament completion/brackets, statistics, recovery/privacy checks, final feedback | Outstanding issues, readiness decision and actual opt-in continuity |
| Until approval | Keep opted in and continue actual use/fix verification | Support remains available; extend when instructed or evidence is insufficient |

Use a lightweight coordinator spreadsheet/form. Keep contact details and tester emails private; repository evidence should use participant IDs only. Record participant ID, role, opt-in confirmation date, device/Android version, app version, scenario/date/result, issue ID, feedback and retest. Do not collect unnecessary personal data or add invasive tracking to satisfy an imagined Google threshold.

Bug records should include expected/observed behavior, reproduction, device/build, severity, assigned owner, fix revision/version and independent retest. Release gate: no unresolved crash, lost/duplicate score, unauthorised data exposure, unusable signup or blocked deletion request; lower-severity issues require a documented release decision. Google approval cannot be guaranteed by this gate.

## Policy, review and operations package

1. Audit actual Supabase and third-party SDK data handling: account identifiers/email/phone, sporting records, photos/comments, venue/location behavior, advertising identifiers/diagnostics and any analytics. Match collection/sharing/purposes/retention to Data safety; do not assume all SDK transfer is declared the same way. Do not claim end-to-end encryption based on HTTPS.
2. Put accessible privacy/terms links in the app and align marketing/Console policies, support identity and deletion steps. Define a supported deletion process for shared records that removes/anonymises associated personal information as appropriate; sporting history alone is not a blanket retention exemption. Test requester verification and completion. The existing generic support instruction does not prove completion.
3. Review UGC scope. Require applicable terms acceptance, content/user reporting and user blocking where required; enforce controls on reads/writes and give moderators an operational queue. A Report button without handling is not an effective moderation process. [UGC policy](https://support.google.com/googleplay/android-developer/answer/9876937?hl=en).
4. Reconcile youth usage, target audience, content rating, ads/AD_ID declaration, consent messages and SDK treatment. Verify merged media permissions; use the system photo picker for occasional logo/avatar selection rather than unnecessary broad access. [Photo permissions](https://support.google.com/googleplay/android-developer/answer/14115180?hl=en).
5. Provide preconfirmed reusable English reviewer credentials and deterministic sample organiser/scorer/player data through Console. No password/OTP secrets belong in repository evidence. Test from a fresh device and retain access during review. Do not build a hidden insecure bypass. [Reviewer access](https://support.google.com/googleplay/android-developer/answer/15748846?hl=en).
6. Use screenshots from the exact Android candidate and describe only released features. SportStage is the store app; Wricket is its cricket module. AuctionYodha integration is future work; payment collection is outside scope. Correct the legacy cricket-only listing if all five racket sports ship.
7. Review current backend permissions, data remediation, backup/restore and monitoring. Set owners and actual alert destinations. Crash/ANR and scoring-error monitoring must identify the build without logging credentials or private player details. Native OTA updates are currently disabled: a native recovery requires a forward build, not a web deploy or lower-version APK.

## Production-access answers: prepare from facts

These are working outlines, not answers to submit unchanged:

- Recruitment: "We recruited [actual number] through [actual groups]. Participants included [actual roles/device spread], and [qualifying number] remained opted in over [actual dates]."
- Engagement: "Participants completed [actual journeys/matches/session counts]. [Actual limitation] was covered by [actual follow-up], with repeat sessions on [versions/dates]."
- Feedback: "Feedback came through [actual channel]. The recurring issues were [actual examples]. We recorded [actual issue count] and verified [actual resolved count]."
- Changes: "Feedback [issue] led to [change] in [version]. [Participant role] retested it on [device/date], with [result]." Distinguish engineering-discovered changes from tester-reported changes.
- Audience/value: Describe actual community organisers, scorers, captains, players and spectators, and the sport workflows they use. Provide a realistic install forecast.
- Readiness: Give concrete candidate/version, device/pre-launch results, resolved blockers and support/recovery arrangements. Web/unit results supplement rather than replace Android evidence.

Keep numbers honest and answers specific. Do not claim all testers used every feature, invent positive feedback or resubmit an unchanged generic description. If the Console shows a specific additional test duration, follow it. Where eligibility appears inconsistent, retain evidence and ask Play support; changing package/developer identity is not a remedy.

## Launch and recovery

Production-access approval unlocks the track; the subsequent release still needs its own review. Configure country availability, declarations, release notes and managed publishing where available. For a first production release, percentage staged rollout is unavailable; limit intended geography and acquisition while monitoring. Percentage stages such as 10 -> 25 -> 50 -> 100 are an option for later updates, subject to readiness. [Rollout rules](https://support.google.com/googleplay/android-developer/answer/6346149?hl=en).

For an incident, retain evidence and stop expansion/marketing; halt a staged update when applicable, keep additive database migrations, preserve scoring event history and ship a corrected higher-version build. Halting distribution does not downgrade installations. Assign a release owner, backup, backend owner and support contact before launch.

## Ready-to-reapply checklist

- [ ] At least 12 qualifying continuous opt-ins confirmed in the current Dashboard; participants actually completed assigned scenarios.
- [ ] Current Play-delivered candidate matches the recorded source/build/manifest/signing evidence.
- [ ] Required physical-device, upgrade, offline/exactly-once and released-sport flows pass.
- [ ] Critical issues resolved and fixes independently retested; feedback record exists.
- [ ] Required account/recovery/deletion, UGC, audience/privacy/ads and app-link paths work.
- [ ] Reviewer accounts and sample workflows checked and maintained.
- [ ] Listing and app-content declarations match the candidate.
- [ ] Pre-launch findings triaged; backend/monitoring/support and forward recovery ready.
- [ ] Application answers use verified cohort/session/feedback facts, with no invented evidence.

Current decision: do not reapply with the same inactive test record. Start with cohort commitment and current-candidate readiness, then run the coordinated closed test. The existing 14-15 testers can be enough if 12 genuinely participate and meet the opt-in requirement. No Console access, tester outreach, app changes, build, upload or submission was performed during this audit.

## Subsequent authorised build and submission

14 October 2026: signed production AAB 2.0.0 (11) was created, inspected and submitted at the user's request. The initial alpha submission failed because it had no countries. The user identified the existing custom closed track; Play API inspection confirmed `SportStage - internal ` with India enabled. EAS configuration was corrected, submission succeeded, and version 11/completed was independently verified on that track. Production-access approval, tester engagement and remaining acceptance gates are still open. See [the build/submission record](verification/ANDROID_PRODUCTION_BUILD_2026-10-14.md).

14 October 2026 execution decisions: user confirmed adults and supervised youth and chose an ad-free launch, with ads deferred until later. Follow the execution tracker for current candidate changes and unresolved gates; earlier advertising findings describe version 11/prior source, not the next ad-free candidate.
