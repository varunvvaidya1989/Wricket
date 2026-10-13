# Expo web hosting

SportStage uses EAS Hosting at **https://sportstageapp.expo.app**. A custom
domain is optional. The project is `@vcreativestudio/sportstage` and its existing
Hosting subdomain is `sportstageapp`; omit `--dev-domain` when deploying.

## Latest verified deployment

Coverage 2 production: **hky6k7mpox** (2026-10-13). Forms/help/identity and destructive-data review acceptance passed on preview and production at 320, 390 and 1280 widths with zero browser errors and fixture cleanup. Final hosted bundle matches the export byte for byte: `a4bb30024966418a32f13bb285207b40d4cb27d9a6429e527446651fd3113175`. Full gate: 906 tests / 157 files, 119 routes. Rollback: **pdb79xgsdb**. [Review](verification/REST-OF-APP-COVERAGE2.md).

## Previous archive deployment

Coverage 1 production: **pdb79xgsdb** (2026-10-12). Archive/fallback responsive,
empty, missing, failure/retry and guest checks passed on export, preview and
production with zero browser errors. Live bundle matches the reviewed export:
`88627feed00270fe226bcdf768493ba3d16a8447e16b7e2d22e5c60e072891a1`.
Build gate: 906 tests, 157 files, 119 routes. Rollback: **oamho42ghy**.
[Review](verification/REST-OF-APP-COVERAGE1.md).

## Previous organiser deployment

Published on 2026-10-12: **`oamho42ghy`**. Production is
[sportstageapp.expo.app](https://sportstageapp.expo.app/); the tested preview is
[sportstageapp--oamho42ghy.expo.app](https://sportstageapp--oamho42ghy.expo.app/).
The production alias was promoted after preview acceptance. The live JavaScript
bundle matches the local export byte for byte (SHA-256
`8aafa843bb48097eb2b78ae7d0f3461d9807ff897c6a653ef868b91e69d657ab`).

Validation: 906 tests in 157 files, lint, TypeScript, project checks and production
export of 119 routes passed. Preview and production browser checks passed for
actual password sign-in return, the organiser workspace, six task destinations,
guest sign-in boundaries, direct refresh and offline lifecycle submission with
reconnect/retry. Checked widths 320, 390 and 1280 with zero page errors. Both
isolation headers are present and hosted JavaScript matches the export. Scoped
hosted test accounts and competitions were removed. Local acceptance additionally
covered real entry approval, scheduling, failed-save retry and club/team roles.
[Design review and screenshots](verification/REST-OF-APP-UX4.md).

Evidence is in ignored `.e2e/web-release/ux4-preview/` and `ux4-production/`,
with sanitized reports/screenshots under `docs/verification/rest-of-app-ux4/`.
Expo's free tier throttled an earlier rapid check; accepted checks pace requests.
No hosting-plan change was made. Native validation remains a separate release
gate. Re-run using locally configured, authorised hosted acceptance credentials:

```powershell
node scripts/e2e/verify-hosted-stage-release.mjs https://sportstageapp.expo.app
```

Previous production deployment: **`nw7ip46h5y`**. If rollback is required, promote
that existing deployment without rebuilding:

```powershell
eas deploy:alias --prod --id=nw7ip46h5y --non-interactive
```

## Build and deploy

Run from `mobile/`. Sign in with `eas login` if needed. The signed-in account must
have access to the `vcreativestudio` Expo organization.

Ensure `.env.local` contains the production client configuration before exporting:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`

Only client-safe values belong in these variables. Expo embeds them in the web
bundle at export time. Native build profile variables in `eas.json` do not
automatically configure a local web export.

PowerShell:

```powershell
$env:APP_ENV = 'production'
$env:EXPO_PUBLIC_ENABLE_NON_CRICKET_SPORTS = 'true'
npm run build:check
eas deploy --environment production
```

Test the preview URL printed by EAS before promoting that same deployment:

```powershell
eas deploy:alias --prod --id=DEPLOYMENT_ID
```

The production alias stays the same across deployments. Re-export after changing
code or public environment variables. EAS Hosting is separate from native EAS
Update; the native `updates.enabled` setting does not disable web deployments.

## Routing and SQLite

Keep `expo.web.output` set to `server` so the exported route manifest lets EAS
resolve dynamic match, tournament, and player URLs. Static-only hosting returned
404 responses for these URLs even though bracket-named HTML files were exported.
The `expo-router` plugin sets `Cross-Origin-Opener-Policy: same-origin` and
`Cross-Origin-Embedder-Policy: credentialless` for browser SQLite. The export
includes the route configuration in `dist/server/_expo/routes.json`; deploy the
entire `dist` export, including both its `client` and `server` directories.

Web SQLite is an in-memory cache. Cloud synchronization remains necessary for
durable web scoring; do not assume native offline persistence on web.

## Authentication and acceptance checks

Add the deployed origin's authentication destinations to Supabase Authentication
URL Configuration: `/`, `/onboarding`, `/reset-password`, and `/account`. Account
for the optional `returnTo` query parameter on sign-in and onboarding links. Keep
existing native callback entries. A preview URL needs its own allowed callbacks
if email authentication is tested before production promotion.

Verify:

- The home page and login page render without JavaScript or SQLite errors.
- A direct match or tournament URL still works after a browser refresh.
- Sign-in, email confirmation, magic links, and password reset complete.
- Cloud scores load and scoring changes synchronize using a designated test match.
- Uploaded images and public score pages load on desktop and mobile browsers.

Tournament share links currently use `sportstageapp.com`. Publishing to Expo
does not redirect those links automatically.

References: [EAS Hosting](https://docs.expo.dev/eas/hosting/get-started/),
[server headers](https://docs.expo.dev/router/web/server-headers/),
[deployment promotion](https://docs.expo.dev/eas/hosting/deployments-and-aliases/).
