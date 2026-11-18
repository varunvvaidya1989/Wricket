# Android production release execution

Started 14 October 2026. Source is the existing uncommitted working tree; no commit created. This tracker covers the Android release plan, not the earlier web revamp phase numbers.

| Phase | Status | Evidence / outstanding gate |
| --- | --- | --- |
| 1 / A: Console baseline and test cohort | IN PROGRESS | Play API confirms completed version 11 on the exact custom closed track SportStage - internal (trailing space) with India enabled. An empty draft also exists; preserve it until its purpose is established. Production access remains unapproved in the supplied screenshot. Tester commitment, qualifying continuity, previous application answers and pre-launch report await Console/user evidence. |
| 2 / B: Release blockers | IN PROGRESS | User confirmed adults and supervised youth and an ad-free launch. Advertising dependency/plugin removal and public privacy/deletion-support entry points are implemented locally; local verification passed: 943 tests / 165 files, 120 exported routes and 10 full-page browser accessibility states with zero violations/page errors and fixture cleanup. UGC/terms/moderation, operational deletion completion, native links, declarations and mailbox validation remain open. |
| 3 / C: Accepted Android candidate | PENDING | Version 11 is the prior submitted baseline and still contains the prior advertising SDK. Source changes need a new higher-version AAB. Do not reupload 11 or claim that a web deployment updates it. Physical and Play-installed upgrade, manifest/16KB and release gates remain open. |
| 4 / D: Coordinated closed test | PENDING | Templates prepared; no participant or session is marked completed. Confirm 12 willing participants and Dashboard eligibility, then run the actual exercises. |
| 5 / E-F: Production-access application/review | PENDING | Use factual cohort/session/feedback/fix evidence after eligibility and readiness gates pass. |
| 6 / G-H: Production launch/operations | PENDING | Requires production access and app-release approval, monitored rollout and operational support. |

## Verified baseline

The original alpha upload failed because that unused track had no countries. User identified the existing custom closed track; API reads and successful EAS submission verified version 11/completed with IN. The built-in internal track is separate. Submission record: [build 11](../verification/ANDROID_PRODUCTION_BUILD_2026-10-14.md). A read transaction is discarded without committing app changes. No tester engagement or review approval can be inferred from release status completed.

## Cohort evidence and Console navigation

Play Console -> SportStage -> Dashboard -> Apply for production shows applicable testing eligibility. Play Console -> Test and release -> Testing -> Closed testing -> Manage SportStage - internal -> Testers contains the invited list/group and opt-in link. Monitor and improve -> Ratings and reviews -> Testing feedback contains submitted feedback. Invitations/group membership are not proof of continuous opt-in or use. Record only what the Dashboard and real participants confirm. If counters/dates are not displayed, preserve the current status rather than inventing them.

Use [the task handout](android-closed-test/TESTER_TASKS.md), [blank participant template](android-closed-test/roster-template.csv) and [issue template](android-closed-test/issues-template.csv). T01-T15 are placeholders, not existing tester identities or completion evidence. Keep names/email addresses and Console screenshots with personal information out of committed evidence. No recruitment message or email was sent by the agent.

## Current release decisions and limits

- Intended audience: adults and supervised youth, confirmed by the user.
- Launch monetisation: ad-free, confirmed by the user. Future ads require new audience/consent and SDK review. The next AAB must prove advertising SDK/ID permissions are absent; source removal alone is not binary proof.
- Email delivery testing remains deferred by the user. A support draft/link is a way to initiate a request, not proof that support receives or completes it. Shared-history accounts still require a supported completion/anonymisation/retention process.
- Phone unavailable in prior instructions; physical checks remain open. Gesture verification remains paused. Do not mark them accepted or run them implicitly.
- No native version downgrade, data clear or repeated upload of version 11 is part of execution.

## Implementation log

14 October 2026: Phase 1 baseline refreshed; real tester evidence pending. Phase 2 first implementation covers ad-free dependency/configuration and public privacy/support/deletion-request navigation. No migration in this increment. Full build gate and focused script lint passed. Browser acceptance covered guest support/deletion at 320/390/1280, invalid topic, sign-in handoff, and real signed-in deletion-review handoff; no email was sent. Visual review confirmed the established font/palette, readable email links and no 320px overflow. [Evidence](../verification/android-release-phase2-support/review.json). Advertising readiness checks now mark the ad-free candidate NOT_APPLICABLE instead of requiring AdMob serving configuration. The public network audit returned UNKNOWN for several hosts; it does not establish that earlier link problems are resolved. No new Android candidate, web deployment or Play submission for these source changes yet.
