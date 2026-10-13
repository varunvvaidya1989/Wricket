# Wricket test foundation

This directory contains isolated authenticated browser/backend journeys, Android acceptance scripts, offline auth UI smoke tests and independently reviewed scoring reference data. Current evidence and release constraints are tracked in [the completion review](../docs/revamp/UX-R0-R5-COMPLETION-REVIEW.md). Native gesture calibration remains paused; iOS and hosted release verification are separate gates.

## Run the available checks

From `mobile/`:

```sh
npm run build:check
npx playwright install chromium
npm run test:e2e:web:smoke
```

The browser command launches its own Expo development server on port 4173 with dotenv loading disabled. It deliberately refuses to reuse a running server, sets an E2E-only local backend configuration, and blocks non-local browser requests in the smoke tests. No login succeeds, no email is sent, and no application records are created by these tests. Browser profiles cover desktop and a mobile viewport; the second test also checks 320 px width.

To use an installed Chrome instead of the downloaded Chromium in PowerShell:

```powershell
$env:WRICKET_E2E_CHROME_CHANNEL = 'chrome'
npm run test:e2e:web:smoke
```

`npm run test:e2e:web` runs all configured browser projects, including WebKit/Firefox; install their Playwright browsers first. Currently these projects run the same two auth UI tests, not the full future cricket matrix. CI runs Chromium and mobile Chromium, retaining HTML/JUnit reports, failure screenshots and traces in ignored `playwright-report/` and `test-results/` directories.

## Real backend prerequisites

The E2E runner never reads the application's hosted target from `.env.local`. Backend operations must use `scripts/e2e/environment.mjs`, which permits only explicit loopback HTTP endpoints on port 54321. The runtime E2E configuration additionally recognises Android's emulator host alias `10.0.2.2`; this exception is unavailable unless `EXPO_PUBLIC_WRICKET_E2E=true`.

Set `WRICKET_E2E_PUBLISHABLE_KEY` to the **local stack** publishable key and run:

```sh
npm run test:e2e:preflight
```

This checks local auth health and makes no changes. It fails closed if the key is missing or the backend is unavailable. It is not a permission/integration test. Local fixture and authenticated journey runners are now available; see the phase review commands below. Do not substitute the development/preview hosted project or run existing production demo-seeding commands.

The app still requires HTTPS and a publishable client key outside explicit E2E mode. E2E mode rejects hosted URLs at both native configuration and runtime boundaries. The smoke placeholder key cannot authenticate; full backend testing must use a real local key.

## Native smoke preparation

The `e2e` EAS build profile uses a separate name, package/bundle ID and `sportstage-e2e` scheme. Production universal/app links are not claimed by this build. It preserves all normal configuration outside E2E mode, including the existing web-hosting edits.

The standalone EAS smoke profile retains its deliberately non-authenticating key. Local Android acceptance uses the installed isolated debug APK and the current JS served by `serve-backend.mjs`, which supplies only the guarded local fixture configuration. This does not configure a hosted build or an iOS runner.

When a dedicated E2E build is installed and Maestro is available:

```sh
maestro test e2e/native/auth-smoke.yaml
```

`clearState` affects only `com.vcreativestudio.sportstage.e2e`. The flow tests invalid sign-in and captures validation; it is not a gesture spike. The R0 native input spike and physical-device acceptance remain open. iOS execution requires a Mac/EAS runner. No native build or paid cloud job has been launched by this change.

## Completion acceptance runners

With the existing fixture and `serve-backend.mjs` running, the following scripts each create and clean up their own scoped resources:

```sh
node scripts/e2e/verify-tournament-registration.mjs
node scripts/e2e/verify-tournament-team-entry.mjs
node scripts/e2e/verify-team-entry-panel.mjs
node scripts/e2e/verify-tournament-participation.mjs
node scripts/e2e/verify-cricket-setup-matrix.mjs
node scripts/e2e/verify-scoring-form-matrix.mjs
node scripts/e2e/verify-cricket-lifecycle-matrix.mjs
node scripts/e2e/verify-scoring-access.mjs
```

Scoring, controls and spectator flags on `verify-cricket-match-start.mjs` should be run separately: the spectator and controls scenarios require a fresh score. Browser screenshots and logs stay under ignored `.e2e/`.

`verify-team-entry-panel.mjs` checks both entry modes, settings-load and write failures, draft retention, colour selection, empty placeholder creation and copied club rosters. It captures the panel at 376/320 px and checks the fixed action in a 500 px viewport. With an already established isolated owner session, set `WRICKET_NATIVE_EXISTING_OWNER_SESSION=1` to also create pool teams with the Android keyboard open at font scales 1.0 and 1.3. The runner restores the original font scale and deletes only its own tournaments.

The Android driver is restricted to `emulator-5556`, the dedicated `Wricket_E2E` API 34 device. Add the local SDK `platform-tools` directory to PATH, install the isolated APK, configure its debug host to `10.0.2.2:4173`, and forward 4173/54321. The prepared debug preferences are copied from `/data/local/tmp/wricket-e2e-prefs.xml` when the E2E app is cleared. Use only one UI automation process at a time.

```sh
node scripts/e2e/verify-native-wricket.mjs
node scripts/e2e/verify-native-participation.mjs
node scripts/e2e/verify-native-scoring-share.mjs
```

Run `verify-native-scoring-share.mjs` without other backend journeys: its outage case stops and restarts only `supabase_kong_wricket-e2e`, verifying port 54321 first. The database and bundler remain running, and a finally block restores the API gateway and emulator font scale. It verifies real native SQLite rows, pending events, cold offline resume, reconnect, canonical event IDs and OS share choosers; it cancels sharing without sending to another person.

Test helpers sign out only their own backend session (`scope: local`), retaining independent native/browser sessions. After the scoring/share script establishes the isolated owner session, run `verify-native-setup.mjs` with `WRICKET_NATIVE_EXISTING_OWNER_SESSION=1`. Alternatively set `WRICKET_NATIVE_SETUP_SIGN_IN=1` to reset/sign into only the E2E app; it does not require a reusable owner session. It checks Test rules, eligible XIs, keyboards, toss and accessible actions at font scale 1.3; cleanup uses its unique venue and fixture owner. After setup, `verify-native-controls.mjs` with `WRICKET_NATIVE_EXISTING_OWNER_SESSION=1` checks large-font native adjustment/retirement/closure modals and canonical bonus, retired-hurt and no-result events. For focused sharing without repeating an outage, run `verify-native-scoring-share.mjs` with `WRICKET_NATIVE_SHARE_ONLY=1` and the established owner session. Run these commands sequentially. Font-scale changes occur with the E2E app stopped; controls resolve a fresh accessible window before captures. No runner targets the personal device or production app. Passing these emulator checks does not certify the release binary, iOS, physical-device performance or a human screen-reader review.

## Reference datasets and limitations

`data/scoring-reference.ts` contains literal expected figures reviewed independently of the implementation. Its tests compare the existing route's `applyBall`/history-restoration path and the canonical replay/scorecard path, including adjustments, retirements and target completion. They do not change or replace the cricket engine.

See [R0 review and blockers](../docs/revamp/UX-R0-REVIEW.md) and [screen/contract inventory](../docs/revamp/UX-R0-CONTRACTS.md). Never use a passing smoke report as evidence that all E01–E30 acceptance families pass.

## Phase 2 and Phase 3 local review

The isolated `wricket-e2e` stack is prepared by `node scripts/e2e/prepare-stack.mjs` and started with `npx supabase start --workdir .e2e/stack`. Seed once per run using `node --input-type=module -e "import { seedFixture } from './scripts/e2e/backend-fixture.mjs'; await seedFixture();"`. The ignored `.e2e/fixture.json` owns the scoped accounts and teams. Preserve an existing fixture while reviewing; seeding is not a reset command.

Run `node scripts/e2e/verify-cricket-privacy.mjs --keep` to verify real owner/viewer/anonymous permissions and retain its public tournament for browser review. Then start `node scripts/e2e/serve-backend.mjs` in another terminal. Run `node scripts/e2e/verify-cricket-navigation.mjs` for root/object navigation, visual measurements, privacy and PNG export. That runner also requires an existing match created through the fixture scorer's setup flow. `WRICKET_E2E_VIEWER_ONLY=1` restricts it to fresh spectator cold-link acceptance.

Run `node scripts/e2e/verify-cricket-toss.mjs` for the first Phase 3 toss slice. It stops at review and verifies no match was created. Reports/screenshots stay under ignored `.e2e/`. These runners target only the explicit local backend; they do not certify native touch or OS sharing.

Run `node scripts/e2e/verify-cricket-match-idempotency.mjs` for concurrent setup retry semantics, `node scripts/e2e/verify-cricket-match-start.mjs` for the standalone path through opening roles, and `node scripts/e2e/verify-cricket-fixture-start.mjs` for a scheduled canonical fixture with inherited tournament rules. Each runner deletes only the match or tournament it creates.

Use `node --input-type=module -e "import { cleanupFixture } from './scripts/e2e/backend-fixture.mjs'; await cleanupFixture();"` only when finished with that fixture. Cleanup checks account ownership and removes only the manifest's resources.
