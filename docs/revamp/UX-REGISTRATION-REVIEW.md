# Tournament registration slice review

Reviewed 10 October 2026. This review covers registration extension phases 1–2 and does not close the earlier revamp phases.

## Implemented behaviour

Creation selects Player pool & auction or Existing teams independently of cricket format. Existing tournaments and callers default to Existing teams. Creation remains private and registrations closed.

Manage → Registrations separates publication from accepting player applications. Fee information and external payment instructions are public registration information. The organiser approves/rejects applications and marks payment Pending/Done independently; free applications retain Not required. Review and payment actions retain actor/time and event history.

Explore search opens a published tournament. Players → Request to join submits the account-bound standard form. The applicant sees their status and payment flag, and can confirm or cancel withdrawal. Only approved players appear in the searchable, role-filtered directory. Registration does not create a team, roster entry, captain permission or tournament staff permission.

Existing-team applications and new tournament invitation types are phase 3. Existing organiser team/roster tools continue to work. No disabled team-registration action is presented.

## Code and permissions review

- New exposed tables have RLS and SELECT-only authenticated grants. Applicant and tournament creator can read the private application; unrelated users cannot. Audit rows inherit the application's visibility.
- Directory RPC projects name, public identity, playing role and registration time only; it excludes phone, applicant note and payment flags.
- Privileged functions live in `app_private`, use an empty search path, verify `auth.uid()` and have explicit authenticated execution grants. Exposed wrappers use invoker security; anonymous execution is denied.
- Canonical account-linked player identity is reused atomically. Submission contains no arbitrary applicant account ID. Unique tournament/account constraint and row locks prevent duplicate application creation.
- Publication/open/configuration and team entry insertion use the registration settings row lock. Mode changes are blocked while applications or teams exist. Fee requirement changes and unpublication are blocked once applications exist; closing remains available.
- Closed/private/wrong-mode submissions, invalid forms and unauthorised review/payment/withdrawal are rejected on the server. Review plus an invalid payment change rolls back atomically.
- Existing tournament lifecycle/settings and legacy overs storage semantics remain unchanged. Entry mode in tournament creation settings initializes the authoritative registration configuration; later reads use that configuration.

## Design review

The new registration views extend the existing revamp design system; no original mockup for this new feature was supplied. Shared Space Grotesk, Inter and IBM Plex Mono fonts, 27 px main titles, 12 px fields, existing surfaces/accent/icons/cards and 44 px controls were reviewed. Five tournament tabs retain 10 px text. Role filters scroll horizontally, including Wicketkeeper at 320 px.

Corrected the new sections' inherited double padding to the revamp's 18 px page inset. Added a focus refresh so returning from another screen reloads registration state. Reviewed the final screenshots after these corrections:

- [Creation entry modes](../../.e2e/registration-entry-mode-376.png)
- [Players at 376 px](../../.e2e/registration-players-376.png)
- [Players at 320 px](../../.e2e/registration-players-320.png)
- [Management at 320 px](../../.e2e/registration-management-320.png)
- [Application review at 320 px](../../.e2e/registration-review-320.png)

## Validation evidence

- `npm run build:check`: passed; 133 test files / 686 tests, lint, strict types, environment/architecture checks and web export. Log: `.e2e/registration-build-reviewed.log`.
- Actual migration regression suite: 20 tests covering permissions, privacy, canonical identities, validation, atomic review/payment, withdrawal and locks.
- `node scripts/e2e/verify-tournament-registration.mjs`: passed against local Supabase with organiser/applicant/viewer accounts; Explore entry, server validation, aborted-write retry, duplicate rejection, approval while payment pending, payment audit, public directory, search/role filters, font/width checks, withdrawal, closing and zero browser page errors. Actual concurrent PostgreSQL submissions produced exactly one application. Log: `.e2e/registration-e2e-reviewed.log`.
- `node scripts/e2e/verify-new-tournament-form.mjs`: existing Test/Turf creation and all six format defaults passed after entry-mode integration. Log: `.e2e/registration-creation-regression.log`.
- Local Supabase security advisors returned `results: []` / “No issues found”. PowerShell reports a nonzero exit from CLI stderr (“Connecting to local database”); the result body was inspected. Log: `.e2e/registration-advisors.log`.

## Remaining gates and deployment

Migration is prepared and applied locally only, with no hosted change or commit. Apply it to the target backend before releasing this client: otherwise registration configuration tables/RPCs will be unavailable. Follow the normal migration deployment process; do not edit or replay it against an already migrated target.

Native keyboard/back/accessibility verification remains in release phase 5. The first form has fixed fields and mandatory organiser review; custom questions and My cricket application tracking follow in phase 4. Rejected/withdrawn applications retain their record and cannot resubmit in this slice. Before adding allocations, protect withdrawal of allocated players and enforce roster/duplicate assignment rules. Refund handling, payment processing and AuctionYodha integration are excluded.
