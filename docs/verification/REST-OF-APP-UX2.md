# Rest of SportStage UX 2 review

Date: 2026-10-12. Implementation: web-validated, local and uncommitted.
No migration or hosted deployment. Android rendering and signed upgrade checks
remain release gates.

Authentication, onboarding, profile, account, notifications and team invitation
acceptance use the access/account design references, shared Space Grotesk,
Inter and IBM Plex Mono fonts, dark surfaces and lime actions. Design review
covers 320px, 390px and 1280px layouts. Public identity previews exclude private
contact fields. Connected sports remain separate from tournament permissions.

Review corrections include restoring identity fields after session hydration,
preserving safe return paths through email recovery, separating notification
load failure from empty results, preventing stale private rows after account
changes and rejecting unsafe notification destinations.

`npm run build:check` passed: lint, strict types, 885 tests in 155 files,
environment and architecture checks and production export of 119 routes.
The connected-experience browser regression also passed with zero page errors.
`node scripts/e2e/verify-account-experience.mjs` passed with zero page errors:

- Sign-in and signup validation, sports onboarding and the requested profile return.
- Identity save, private/public separation and connected sports at all three widths.
- Password change accepts the new password and rejects the old one.
- Notification grouping, acknowledgment, actual destination opening, cross-account
  row-level permissions, unsafe-link rejection and failed-load retry.
- Captain invitation survives guest sign-in and creates the invited membership.
- Local sign-out removes private profile access without clearing application data.
- A real recovery token changes the password and returns to the requested profile;
  an expired link retains its requested task.

The recovery review found that token restoration can replace the router's initial
query state. The reset screen now retains the independently validated callback
destination from the initial link. The browser test uses the actual recovery
request's query parameters, including Expo's encoding.

Screenshots: [Sign in](rest-of-app-ux2/signin-390.png),
[Profile](rest-of-app-ux2/profile-320.png),
[Account](rest-of-app-ux2/account-390.png),
[Notifications](rest-of-app-ux2/notifications-390.png),
[Reset password](rest-of-app-ux2/reset-password-390.png).
[Executed checks](rest-of-app-ux2/review.json) contain no credentials.

The local browser harness uses disposable accounts and actual local Supabase
permissions. Notification failure presentation uses a controlled 403 response.
Local email confirmation is disabled, so real signup leads to onboarding;
hosted email delivery and verification still require release validation.
Recovery uses real local tokens with the callback host adapted to the Expo
test server. Tournament placeholder captain claims need their focused organiser
presentation review in UX 4; native media picking remains a UX 5 gate.

Account data controls preserve their existing confirmations. Real account
deletion and local-data clearing were not exercised on a user account. The
local fixture encountered a Storage cascade protection error while deleting
its disposable, media-free account; backend deletion compatibility needs a
separate release check. No Storage protection bypass was added to app code.
