# UX-R0 implementation and review log

Current implementation and acceptance updates (11 October 2026): see [the registration and phases 1–6 completion review](UX-R0-R5-COMPLETION-REVIEW.md). The older progress and blocker descriptions below are retained as dated history; they do not describe the newly completed atomic persistence, format/outcome matrix, registration or Android recovery work. Hosted rollout, iOS, paused native gesture calibration and physical-device accessibility remain explicit release gates.

Date: 25 September 2026. Status: **IN_PROGRESS — exit gate not satisfied**.

Implementation and self-review: Codex. Application base: `3ebd23c`; changes are uncommitted. Existing user edits to `app.json` and `docs/web-hosting.md` were present before work and are preserved.

## Delivered increment

- Local-only E2E environment guard and backend health preflight; hosted application configuration is never inferred as a test target.
- Playwright browser projects, two executable real-app auth/validation smoke flows at desktop/mobile sizes, reports/traces and a separate PR workflow.
- Dedicated EAS smoke profile and dynamic app configuration with a separate E2E app ID/scheme. Normal app configuration is preserved. Native profile execution is pending.
- Independently specified scoring reference ledger checked against current route command/history restoration and canonical event replay/scorecard, adjustment target completion and retirement attribution.
- [All 48 screen contracts and prerequisite tickets](UX-R0-CONTRACTS.md), plus [runner instructions and scope](../../e2e/README.md).

## Task status

| Task | Status | Evidence / remaining work |
| --- | --- | --- |
| T01 / Q01 baseline | DONE for baseline and increment review | Final build check passed: lint/types, 117 test files / 552 tests, environment/architecture checks and web export |
| T02 screen/role/service mapping | DONE | 48 states mapped in contract inventory |
| T03 / Q02 reconciliation | DONE as decision inventory; implementation prerequisites remain | R0-C01–C12 specify adapter and presentation contracts; golden scoring reference is executable; no engine replaced |
| T04 browser/backend/native test foundation | IN_PROGRESS | Browser runner/CI, local guard and native smoke profile added; real seed/cleanup/accounts and backend journey still pending |
| Q03 backend smoke and seed lifecycle | BLOCKED | R0-B01/B04: no local database; no passing real-auth/scoring result claimed |
| T05 / Q04 native gesture spike | BLOCKED; browser auth smoke passes | R0-B02/B03: no connected native device, Maestro or iOS runner; no gesture evidence claimed |

## Verification evidence

1. Initial `npm run build:check`: exit 0, 114 files / 522 tests; web export completed. Log: local temp `wricket-r0-baseline.log`.
2. Targeted configuration/environment/reference/build-identity checks: 4 files / 34 tests passed after correction of an ambiguous scoring-module import. Strict TypeScript passed.
3. `npm run test:e2e:web:smoke` using installed Chrome: 4 passed (two cases on desktop/mobile Chromium). Real Expo app rendered; invalid-form and mode/navigation states checked at 320 px too. Local `playwright-report/index.html` and `test-results/results.xml` contain artifacts. This is development-server offline UI smoke, not authenticated cricket E2E or release-artifact certification.
4. Missing-key backend preflight exits 1, as intended. No backend records were mutated.
5. Final `npm run build:check`: exit 0, 117 files / 552 tests; lint, strict types, environment/architecture checks and web export passed. Log: local temp `wricket-r0-final.log`.
6. Docker retry initially confirmed missing WSL. After the requested `wsl --install` and restarting the stalled Docker Desktop processes, WSL reports version 2.7.14 with Ubuntu and docker-desktop registered under WSL 2; `docker info` successfully returns engine version 29.6.1. Local `supabase start` is downloading its first-run container images. Backend health and authenticated acceptance are not yet verified. Ubuntu's first-run provisioning command has not returned.

## Stage review and corrections

- Fixed an initial test import that resolved `domain/scoring.ts` instead of the canonical `domain/scoring/index.ts`. Added a reference case through the actual existing `applyBall` and saved-history path so the tests do not only certify an unused API.
- Verified the test configuration rejects hosted URLs, credential-bearing URLs, wrong ports, extra paths/query/fragments and unsafe run IDs. Explicit local test mode is required for HTTP; normal production configuration retains HTTPS requirements.
- Tested the E2E app identity and preserved original hosting config; test builds do not claim production deep links.
- Separated invalid-auth UI smoke from real-backend acceptance in commands, README and evidence. No skipped or unavailable native/backend run is marked passed.
- Kept test artifacts/credentials out of Git; retained failures without automatic retries. The new CI workflow is defined but has not run on hosted CI.
- Existing React Native Web deprecation warnings and Expo patch-version recommendations appeared during smoke. They did not cause runtime errors in the checked flow; dependency upgrades outside the new pinned Playwright dependency were not performed.

## Gate decision

**Do not close R0 or start dependent feature rollout.** A complete persisted quick-match/scorer/spectator flow, isolated seed/cleanup and native gesture feasibility are not verified. First unblock the local backend, add/verify scoped seeds and run that flow; arrange Android and iOS execution for the native spike. R1–R8 remain backlog. The available test foundation is reviewable now, but it does not satisfy the entire R0 exit gate.
