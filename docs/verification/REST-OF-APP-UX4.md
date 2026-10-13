# Organiser presentation review

Design source: `../../../docs/UI Designs/wricket-rest-of-app/exports/` and
`mockups.js`, especially competitions, competition, manage, entries, schedule,
officials, resources, publish, advanced, club and club-team. Cricket retains its
existing tournament workspace; these shared screens cover the five racket sports.

Public competition pages lead to registration, matches, entries, table and rules.
Organiser tools use a separate workspace with six focused destinations. Query
parameters retain the selected task after refresh; every private destination
checks the loaded permission before rendering. Broad organiser access remains
distinct from fixture scoring permission. The list checks existing permission
RPCs, including accepted organisers, instead of equating ownership with access.
No migration or authorization-policy change.

Entries are grouped by status, registration explains approval, and entry decisions
are reviewed before submission. Lifecycle changes also require explicit review.
Scheduling still creates one fixture between approved entrants and obeys the
existing registration-lock rule. Saved timezone, schedule version, idempotency,
team-tie lineup and attendance commands are retained. The public match list does
not show organiser fixture controls or manufacture a live score for a scheduled
match. Sponsor editing remains available in the organiser lifecycle section.

Scoped presentation components apply Space Grotesk, Inter and IBM Plex Mono,
29px titles, 17px headings, 13px buttons, 12px body and 11px captions. Review
corrected encoded icon/separator characters, legacy green buttons, task header
labels, long-dialog scrolling and missing-resource copy. Club and team roles
distinguish owner, manager, member and viewer. Their requests and competition
requests guard against stale account state; unavailable data has a retry action.

The existing cricket captain-claim panel was reviewed in source: it uses the
cricket design tokens, a scrolling sheet, an explicit target account or open
claim explanation, seven-day expiry, replacement-link revocation, a synchronous
operation lock and recoverable errors. It retains its existing flow. Its domain
regressions remain in the full suite; no new native claim acceptance is implied.

Local browser acceptance uses `scripts/e2e/verify-organiser-experience.mjs` and
only disposable local fixtures. It covers actual registration, rapid-repeat
submission, approval, access denial in UI and RPC, timezone scheduling,
save-failure retention/retry, lifecycle review without accidental mutation,
direct refresh, unavailable responses, club/team roles and 320/390/1280px
workspace layouts. Test resources are removed in dependency order and fixture
sport preferences are restored. Evidence lives in `rest-of-app-ux4/`.

Final local acceptance passed with zero browser page errors. The production
`npm run build:check` gate passed: 906 tests in 157 files, lint, strict types,
environment/architecture checks and 119 exported routes. Temporary fixture
competitions and clubs were verified absent after cleanup. Competition detail
RLS remains authenticated: guests receive an explicit sign-in destination, and
signed-in viewers see public information without organiser controls.

Hosted review rejected preview `e6jg9qpig0` before promotion: authentication
discarded ordinary competition URLs, and the initial server/browser render
differed while fonts loaded. The return-path allowlist now accepts known
competition sections while rejecting extra redirect/role parameters. The route
gate preserves competition context through sign-in/onboarding/sport connection.
The web root mounts after hydration; native font startup retains its existing
path. Five security regression cases were added, and the full production gate
was repeated successfully. The earlier preview never replaced production.

Preview `oamho42ghy` passed hosted browser acceptance with zero page errors:
actual password sign-in retains competition context, six organiser sections
refresh, guest access receives the sign-in destination, and an actual offline
lifecycle submission retains the review until reconnect/retry. Hosted JavaScript
matches the export byte for byte, SHA-256
`8aafa843bb48097eb2b78ae7d0f3461d9807ff897c6a653ef868b91e69d657ab`.
Scoped hosted accounts and competitions were removed. Earlier browser bursts
hit Expo Hosting's temporary free-tier throttling; accepted checks pace requests.
No hosting-plan change was made. Evidence is in `rest-of-app-ux4/hosted-preview/`.

The same deployment was promoted to [production](https://sportstageapp.expo.app/).
Production acceptance passed with zero page errors and the same bundle hash.
Both isolation headers, actual authentication return, six organiser task links,
direct refresh, guest access and offline/reconnect were checked. Production
test accounts and competitions were removed. Evidence is in
`rest-of-app-ux4/hosted-production/`. Rollback deployment: `nw7ip46h5y`.
Android, native media/sharing and signed upgrade remain UX 5 gates.

The permission lookup reuses the existing
[Supabase JavaScript RPC interface](https://supabase.com/docs/reference/javascript/rpc).
Deployment uses a preview followed by promotion of that same immutable export,
as described in [Expo deployments and aliases](https://docs.expo.dev/eas/hosting/deployments-and-aliases/).
