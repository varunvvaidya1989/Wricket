# Supabase and 2Factor phone authentication

18 November 2026. Backend integration is deployed; carrier delivery is failing. The user has now authorised publishing the frontend and a new Android closed-test build; see the [November release record](RELEASE_2026-11-18.md) for the resulting deployment status. This is not a match-day readiness sign-off.

## Result

- Supabase project: Wricket / `lzgnuqwvsioinwwrsdvn`, Mumbai. AuctionYodha's separate project was not changed.
- Edge Function: `send-sms-twofactor`, with gateway JWT verification disabled because Supabase Auth signs requests using Standard Webhooks. The handler requires a valid signature; an ordinary user JWT is insufficient.
- Provider: the new SportStage 2Factor account, SMS OTP product, approved template **SportStage Login** and sender **SSTAGE**. The integration calls the manual-code OTP API, not `AUTOGEN` or the previously rejected transactional template.
- Supabase remains responsible for signup, identity, OTP generation, verification, sessions and expiration. Existing UUIDs, RLS, email sign-in, match history and scorer authorization are preserved. No database migration was required.
- Hosted phone provider and SMS hook are enabled. Codes are six digits, expire after 300 seconds and have a 60-second resend interval. Existing email configuration was not overwritten.

One real Supabase OTP request to the user-authorized phone ending 3862 was accepted at 16:12 IST. The hook's signed path reached 2Factor successfully. The user did not receive the SMS. Their dashboard row at 16:12:21 shows the correct destination, sender SSTAGE, one credit charged and **NO-ANSWER**. The fallback checkbox is unchecked. This does not establish successful SMS delivery or prove whether a voice route was selected. Provider clarification is required. No further codes were sent after the failure report. No real Supabase OTP was verified and no completed parent sign-in is claimed.

## App changes

`Use phone SMS code` is available from the existing auth screen. It supports Indian mobile numbers, code entry, resend cooldown, different-number reset, validation, provider error states and return to email login. Return destinations continue through RootAccessGate. Existing email accounts are not silently merged using editable contact-phone metadata.

Cricket onboarding creates the canonical player profile after sport setup. Parents can use the child's playing name; the selected scope is one player profile per parent phone. The subsequent profile-details requirement collects a mandatory private contact email and phone even for phone-authenticated accounts; these do not change or verify sign-in identities. Adding an authentication email separately still uses Supabase confirmation. Password screens explain phone-only login rather than requesting a nonexistent password.

Authentication does not itself enter a player in the tournament. Existing-team entry uses the authorised roster flow; player-pool entry still requires application, organiser approval and allocation. New organiser submission on a parent's behalf is not implemented in this increment.

## Security and provider behavior

The signing secret and 2Factor key are installed as server secrets. No service-role key is required by this function. Raw provider errors, request URLs, codes and phone numbers are not logged or returned. The handler validates signed payloads, bounds body size, restricts delivery to the configured Indian mobile route, uses a four-second provider timeout and rejects redirects. It does not automatically retry an ambiguous send.

Standard Webhooks checks signature and timestamp tolerance; it is not a durable exactly-once delivery ledger. Supabase resend limits and the UI guard limit repeated requests, but a signed request replay within tolerance or a platform retry can still cause an additional provider submission. API acceptance is not carrier delivery.

The user shared the provider key in a screenshot. Rotation was requested and remains unverified. Rotate it in 2Factor, update ignored `.env.twofactor.local`, then rerun deployment to update server secrets. Never place it in `EXPO_PUBLIC_` values or commit it.

## Deploy and rollback

From `mobile/`, set `SUPABASE_ACCESS_TOKEN` in the process environment and use an ignored local file containing `TWOFACTOR_API_KEY`:

```sh
node --env-file=.env.twofactor.local scripts/deploy-twofactor-sms.mjs --production
```

The script checks the linked target, refuses to overwrite a different enabled hook, preserves a scoped private copy of the prior Auth settings, installs secrets, deploys only this function, tests unsigned rejection, then patches only the SMS/phone settings and verifies read-back. The Management API's non-plaintext secret representation is checked for presence; a signed invalid-payload probe separately confirmed signature acceptance and rejection before provider delivery. Do not use a whole-project config push for this integration.

Private deployment evidence/rollback settings: `.e2e/twofactor/previous-auth.json`, `hook.env`, `supabase-deployment.json`, `signed-deployment-check.json`, `native-auth-request.json`. These are ignored and must not be attached to a public release.

To suspend this trial, disable the Send SMS Hook and Phone provider in the SportStage Supabase dashboard, or restore the scoped previous fields via the Management API after reviewing current settings. Keep email login enabled. Do not delete Auth users, player records or match history. To restore the previous expiry/frequency values, use the private snapshot rather than guessing. API key rotation is separate from hook signing-secret rotation; rotating the hook secret must update Auth configuration and function secrets together.

## Verification

The final full gate passed lint, strict types, **959 tests across 168 files**, environment/architecture checks and web export of 120 routes. Focused script/Edge lint also passed. The final exported app passed browser checks at 320, 390 and 1280 pixels: number/code validation, mocked SMS requests, resend cooldown, expired-code feedback, changing numbers, email fallback and return-destination retention. Six full-page accessibility scans had zero axe violations; no page errors or horizontal overflow were observed. Evidence: ignored `.e2e/twofactor/browser/report.json` and screenshots. No live SMS or real session was used by browser tests.

Focused security tests use real Standard Webhooks signatures with mock provider responses: unchanged code/template forwarding, invalid/expired/tampered signatures, unsupported payloads, unconfigured handler, body limits and error redaction. No paid SMS is sent by tests. Hosted unsigned requests return 401; correctly signed unsupported payloads return 400 without contacting 2Factor. The real native Supabase request returned success, establishing Auth-to-hook signature compatibility.

Browser checks run against the exported app with mocked Auth endpoints:

```sh
npx expo serve --port 4173
node scripts/e2e/verify-phone-otp.mjs
```

The browser fixture must include the Supabase API version/error-code contract; missing cross-origin header exposure initially caused an unrealistic generic-error assertion. The mock was corrected. Accessibility review also found that native `sms-otp` autocomplete is invalid HTML; the component now uses `one-time-code` on web and retains `sms-otp` on native. Browser evidence does not certify Android hardware or real delivery.

## Remaining acceptance

1. Resolve NO-ANSWER with 2Factor for this exact account/template/manual-code endpoint. Confirm that the route provides SMS and whether any registration or account enablement is pending. Do not assume provider template approval proves carrier approval.
2. After a provider-side resolution, send a new Supabase code only as part of an intentional test, receive it by SMS and complete verification in the app. Confirm onboarding and organiser search on that real profile.
3. Test on the scorer/parent Android phone, including cold restart, session refresh, invalid/expired codes and email fallback.
4. Deployment is now explicitly authorised before carrier-delivery acceptance. Backend deployment does not update either frontend; consult the November release record for frontend status. Successful publication must not be reported as successful SMS delivery.

## Sources

- [Supabase SMS Hook](https://supabase.com/docs/guides/auth/auth-hooks/send-sms-hook)
- [Supabase phone OTP request](https://supabase.com/docs/reference/javascript/auth-signinwithotp)
- [Supabase OTP verification](https://supabase.com/docs/reference/javascript/auth-verifyotp)
- [Auth configuration Management API](https://supabase.com/docs/reference/api/v1-update-auth-service-config)
- [2Factor manual-code OTP flow](https://dial2verify.com/corp/support-system/tkt/knowledgebase.php?article=19)
