# SportStage launch readiness — 22 September 2026

**Market:** India. **Platforms:** Android and web. **Marketing budget:** ₹10,000–₹50,000 per month.

**Decision: prepare a supervised pilot; hold broad paid acquisition and do not forecast approved ad revenue yet.** The local application has passing engineering checks, but public distribution, link infrastructure, monetization approval, and production acceptance evidence are incomplete.

This review covers the working tree based on commit `031b077`, including the uncommitted UX redesign. It is not a review of an uploaded AAB. No production data was changed, campaigns purchased, or store releases submitted. Play Console, AdMob, hosting/DNS administration, and production backend dashboards were not accessed.

The fresh public checker returned **2 PASS and 6 REVIEW**, with exit code 1 as intended for unresolved findings. Raw evidence: `.expo/launch-readiness-2026-09-22.json`. These are endpoint/configuration checks, not an overall product readiness score.

## Evidence and release gates

| Area | Status | Finding and action |
| --- | --- | --- |
| Local engineering | PASS, local scope | The existing same-session full build log shows lint, strict TypeScript, 111 test files / 485 tests, environment and architecture checks, and web export passing. This is not native release certification. Evidence: `.expo/ux-review/build-check.log`. |
| UX integration | PASS, mocked web scope | Guest launch/sign-in return route and signed-in setup, quick scoring, duplicate tap guard, undo, detailed scoring, and failed-save recovery were browser-tested with intercepted requests. See `SPORTSTAGE_UX_REDESIGN.md`. |
| Apex domain | BLOCKER for acquisition and shared links | Direct requests to `https://sportstageapp.com/` returned a 114-character HTML script redirecting to `/lander`. The same placeholder appeared at `/app-ads.txt`, `/privacy`, `/delete-account`, and `/.well-known/assetlinks.json`. A 200 status is not evidence of a working destination. |
| Marketing website | NEEDS UPDATE | `https://www.sportstageapp.com/` works. It describes a cricket-first future and says store links will become available. Android and iOS badges point to `#download`, not their stores. Align the copy and screenshots with the actual release; remove unsupported launch claims. |
| Android distribution | UNVERIFIED | The package's public Google Play URL with `gl=IN` returned 404 in this check. This does not establish whether a private/closed test exists. Confirm listing availability, production access, reviewer credentials, and the actual release track in Play Console. |
| Release handoff | CONFIGURATION MISMATCH | `eas.json` submission profile targets `alpha`, `releaseStatus: completed`; `docs/google-play-release.md` describes an internal draft and version 1.0.0, whereas `app.json` says 2.0.0. Reconcile the instructions before submitting. The profile name `production` alone does not select the Play production track. |
| Android app links | BLOCKER for advertised deep links | `app.json` verifies `sportstageapp.com` for `/tournament`. That host did not provide assetlinks JSON. `TournamentShareBanner.tsx` also builds links on that host. Serve the association file at the exact configured host and validate the Play App Signing certificate, installed-app routing, and browser fallback. |
| Web application distribution | UNVERIFIED | Local export works. The checked www website is a marketing site; this review did not verify a deployed functional web scoring app. Publish and test the intended web-app destination, refresh behavior on nested routes, auth callbacks, and public score links. |
| Privacy and deletion | PARTIAL | A public policy exists at `https://www.sportstageapp.com/privacy` and includes an email account-deletion request path. In-app deletion exists in `app/account.tsx`. A dedicated `/delete-account` page is absent, but a suitable prominent policy section may satisfy the web pathway. Verify mailbox handling, actual deletion/retention behavior, current navigation instructions, and the Play Console URL. |
| Advertising disclosure / youth audience | NEEDS REVIEW before ads | The public policy permits supervised youth sport. Native ad requests hardcode under-age and child-directed flags to false. Confirm actual intended age groups and implement appropriate treatment if children are included; do not infer audience classification from those booleans. Review disclosure of AdMob identifiers, sharing, consent, and retention in policy and Data safety. |
| Android AdMob implementation | PARTIAL | Production-looking app and banner unit IDs, consent gating, and privacy options are present. The banner is mounted on the cricket home feed. IDs in source do not prove ownership, approval, demand, fill, or earnings. |
| AdMob verification | BLOCKER for dependable ad monetization | Apex `app-ads.txt` is HTML; www `app-ads.txt` returned 404 with a browser user agent. Publish the publisher record provided by AdMob and complete app verification/readiness in that account. |
| Tester ad traffic | NEEDS FIX before release-build testing with ads | `SportStageBannerAd.native.tsx` switches to a live unit when `__DEV__` is false. Preview/release-mode builds can therefore request real ads unless console test-app/test-device settings apply. Use explicit environment-aware test configuration or registered test devices/apps; never click live ads during testing. |
| Ad reliability | IMPROVEMENT NEEDED | Failed initialization is cached as false for the process, and a failed banner stops rendering for that mount. Add observable failure states and a bounded recovery strategy before relying on ad income. |
| Web advertising | NOT IMPLEMENTED | The non-native banner component returns null. Android AdMob integration does not monetize the website. A separate approved web integration or directly sold sponsor placement is needed. |
| Acquisition measurement | GAP for paid scaling | No dedicated product analytics, attribution, or crash-reporting integration was found in the searched source/dependencies. Existing match/player statistics are not a marketing conversion funnel. Instrument and verify attribution, first completed match, repeat play, errors, and revenue. |
| Paid plans / entitlements | NOT IMPLEMENTED in reviewed source | No purchase SDK, payment processor, or paid subscription entitlement implementation was found. Pricing in the growth plan is a validation proposal, not an available checkout. |
| Native/backend acceptance | UNVERIFIED for this release | Run real-device tests, scorer handoff, poor-network recovery, auth/deletion, current backend security checks, load/freshness tests, and restore drills. The production runbook records earlier evidence and outstanding dashboard actions; those are not revalidated by a web build. |

## Immediate action queue

| Priority | Owner role | Task | Acceptance evidence |
| --- | --- | --- | --- |
| P0 | Hosting owner | Repair apex/www routing without dropping tournament paths; identify the deployed web app. | Working links on Android with app installed/uninstalled and on desktop; real app-link JSON at the configured host. |
| P0 | Release owner | Make download CTAs truthful and connect the correct public listing or explicitly labeled pilot signup. | A new user in India can reach the intended install/signup flow. |
| P0 | Release owner | Reconcile EAS track/version docs, verify native artifact and Play requirements. | AAB ID, version code, signing identity, track, API target, reviewer account, pre-launch report, and rollback owner recorded. |
| P0 before ads | Monetization owner | Publish app-ads.txt, link the store listing, configure test traffic and privacy messages. | AdMob shows verified app and Ready status; a consent/test-device exercise passes. |
| P0 before youth ads | Product/privacy owner | Resolve audience classification and ad treatment; align privacy and Data safety with actual SDK behavior. | Documented target groups and tested applicable consent/age behavior. |
| P1 | Engineering | Add analytics, crash/error monitoring, and campaign-source capture. | A test cohort can be traced from source through signup and first completed match, without logging names/phones to marketing events. |
| P1 | QA and organizers | Pilot 20 real matches with at least 5 organizers across the initial promoted sports. | No unresolved lost-score, unauthorized-access, or unrecoverable scoring defect. Record latency, device, network, score correctness, and support incidents. |
| P1 | Backend owner | Revalidate RLS/auth, backup restoration, freshness and load for the release environment. | Dated evidence attached to the exact release; check the runbook's leaked-password protection action. |
| P2 | Product/engineering | Validate paid willingness, then implement billing and entitlements. | Purchase/restore/expiry/refund flows tested before selling digital upgrades. |

## Current store and advertising requirements checked

- New Android app/update submissions generally need API 36 from 31 August 2026. Inspect the final AAB; Expo dependency defaults are not sufficient evidence of its manifest. [Google Play target API policy](https://support.google.com/googleplay/android-developer/answer/11926878?hl=en).
- If using a personal developer account created after 13 November 2023, production access requires the applicable closed test with 12 continuously opted-in testers for 14 days. Account type/eligibility here is unknown. [Testing requirements](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en-GB).
- Required app-ads verification and the AdMob readiness review must complete before full serving. [App verification](https://support.google.com/admob/answer/14538460?hl=en), [readiness](https://support.google.com/admob/answer/10564477?hl=en-GB).
- Development/testing must use demo ads or configured test devices/apps. [Testing ads](https://support.google.com/admob/answer/9388275?hl=en).
- Consent information should be refreshed and ads gated by permission to request ads; applicable privacy choices must remain accessible. [UMP guidance](https://developers.google.com/admob/android/privacy).
- If children are among the target audience, apply the relevant Families requirements, including mixed-audience treatment when applicable. [Families policy](https://support.google.com/googleplay/android-developer/answer/9893335?hl=en).
- A web deletion request route can be a sufficiently prominent, functional section of a policy page. Confirm the live URL in the Data safety declaration. [Account deletion guidance](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en).

## Rerun the readiness checks

From `mobile/`:

```sh
npm run launch:check -- --output .expo/launch-readiness.json
npm run build:check
```

`launch:check` performs read-only HTTP/configuration checks. It checks page content as well as status, verifies the expected publisher entry and basic app-link association shape, and reports the submission configuration. It exits nonzero for REVIEW or UNKNOWN so unresolved findings are visible. Network errors are UNKNOWN, not proof of an outage. Its basic file checks cannot verify certificate correctness, policy sufficiency, indexability, or account approval.

For each candidate release, attach native test results and screenshots from Play Console and AdMob, then explicitly mark manual gates PASS / FAIL / UNKNOWN. Do not calculate a reassuring percentage that hides a blocking distribution, scoring, or privacy issue.

After the P0 items and field acceptance pass, use a limited rollout with a named support owner. Expand only after activation, recurring use, and scoring reliability are measured.
