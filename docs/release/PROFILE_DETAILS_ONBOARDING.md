# First-time profile details

New accounts complete `/onboarding` after sign-in. Name, contact phone, contact email and at least one sport with a primary sport are required. Age, country/state/city and profile photo are optional. Completion opens the primary sport's home page, including when authentication began from a match or invitation link. Returning users retain the normal return-link behavior. Account → Personal details reopens the form for later edits.

Country, state and city options use the MIT-licensed `countrycitystatejson` library, with cities loaded per country. Changing country clears state/city; changing state clears city. Searchable pickers support Android and web. The library's geographic coverage determines available choices.

Contact details, age and location live in the owner-readable `account_details` table, separate from public player profiles. These are contact fields; saving them does not change or verify authentication identities. The completion RPC validates required fields and saves profile, sports, cricket player identity and completion in one transaction. Optional photo upload must succeed before the completion RPC runs. Existing completed accounts are grandfathered without requiring another setup pass.

Migration `20261118130351_add_private_onboarding_details.sql` is applied to SportStage project `lzgnuqwvsioinwwrsdvn`. Post-migration security advisors reported no errors. The web and Android application changes have not been published by this task. The earlier 2Factor SMS delivery issue remains separate from profile completion.

Verification:

- `npm run build:check`: passed lint, strict TypeScript, 976 tests across 170 files, environment/architecture checks and web export (121 routes).
- Seventeen focused validation, real geographic dataset and PostgreSQL migration tests cover required/optional fields, rollback, legacy completion and owner-only reads.
- `scripts/e2e/verify-profile-onboarding.mjs --hosted` uses a local exported application with disposable confirmed-email accounts against the intended hosted backend. It does not send OTP SMS or verification emails. A server-only fixture credential must be supplied through `SPORTSTAGE_HOSTED_E2E_KEY`; never commit that credential.
- Browser scenarios cover widths 320/390/1280, required-only completion, location resets, photo upload, failed-save retry, primary Cricket/Tennis routing, persisted completion, later editing and cross-account private-read denial. Reports and screenshots are ignored under `.e2e/onboarding-details/`. Disposable accounts and uploaded photos are removed after each run.
- Final hosted acceptance passed on 2026-11-18: all three widths, zero accessibility violations and zero browser errors. All three disposable accounts and their uploaded media were removed. The browser harness waits for the location modal's closing animation to detach before inspecting the underlying form.
