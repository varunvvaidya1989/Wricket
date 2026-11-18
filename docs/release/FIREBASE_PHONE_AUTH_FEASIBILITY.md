# Firebase phone authentication assessment

18 November 2026. Status: feasible in principle; NOT integrated or accepted for a live tournament. A new Firebase project is required. No cloud settings, billing, auth sessions, production data or installed dependencies were changed by this assessment.

The requested tournament has four teams, nine players per team and five-over underarm tennis-ball matches. The user selected one player profile per parent phone for this tournament. Parents authenticate; the profile carries the child's playing name. This scope does not provide multiple children under one account. Existing email accounts and all canonical player/match identities must remain supported.

## Reproduced compatibility constraints

Run from `mobile/`:

```sh
node scripts/check-firebase-auth-feasibility.mjs
```

The experiment uses in-memory PGlite and the installed Supabase SDK, without a network connection. It loads the actual initial profile table definition and models the UUID `auth.uid()` contract used by the repository's existing migration tests. It does not inspect the current hosted helper or run the full migration chain.

| Check | Observed result |
| --- | --- |
| Non-UUID Firebase subject passed to the existing UUID identity helper | PostgreSQL `22P02` |
| UUID-shaped subject inserted as a profile without a Supabase Auth user | Foreign key rejection `23503` |
| Existing UUID with corresponding Supabase Auth user | Profile ownership query succeeds |
| Installed SDK client configured with `accessToken`, then `auth.getSession()` | SDK rejects auth API access |

Evidence is written to ignored `.e2e/firebase-auth/feasibility.json`. Successful reproduction means the constraints were confirmed, not that Firebase login passed.

Relevant application boundaries: `components/providers/AuthProvider.tsx`, `components/providers/RootAccessGate.tsx`, `lib/supabase/client.ts`, `lib/supabase/profiles.ts`, `lib/auth/offlineScoring.ts`, and account deletion/recovery. The current auth context requires a Supabase `Session`. Database permissions and roster commands use UUID `auth.uid()` values; `profiles.id` references `auth.users.id`. A Firebase access token does not create a Supabase Auth session or user automatically.

## Integration decision before implementation

Keep existing UUIDs authoritative. Do not convert account IDs to Firebase strings, replace the global Supabase client with an external-token client, override the platform `auth.uid()` helper, weaken RLS, trust a client-supplied account ID, or automatically merge identities using unverified phone metadata.

Two paths need a separate implementation decision:

1. Firebase as an external identity provider: private `(issuer, subject)` to canonical UUID mapping, trusted provisioning, explicit account linking, and provider-aware authorization/session handling throughout SQL, Storage, Realtime and the app. The existing profile-to-Auth foreign key and account lifecycle require explicit treatment. Registering the Firebase project in Supabase is only token trust configuration.
2. Firebase verification followed by a server-side exchange into a supported Supabase session: verify Firebase ID tokens and recent phone authentication on a trusted backend, map identities atomically, and prove a supported session issuance/lifecycle mechanism. No custom JWT signing shortcut or invented client session. This path is a candidate to investigate, not a working exchange delivered by this assessment.

Direct Supabase phone auth remains the smaller alternative if the integration work exceeds the tournament timeline. Firebase is not a replacement SMS transport for Supabase-generated OTP codes.

## New project setup

1. Create a project in the [Firebase Console](https://console.firebase.google.com/). Use a separate development/test project for initial acceptance. Analytics is optional for phone authentication.
2. Register Android package `com.vcreativestudio.sportstage`. Add the correct SHA-1/SHA-256 signing fingerprints, including Play App Signing for a Play-installed build. Register a web app too if parents will sign in on the website.
3. Enable the Phone authentication provider. Configure the SMS region policy for India. Add fictional phone numbers and fixed codes through Firebase's test-number controls for initial development; never add a production auth bypass.
4. Real verification SMS requires Blaze billing. Enabling billing is an account-owner action; review current pricing and quotas before enabling real sends. Budget alerts are notifications, not a guaranteed spending cap.
5. Configure Android app verification and web authorized domains/reCAPTCHA for the actual deployment hosts. Native Firebase needs a new Expo development/release build; Expo Go is insufficient for React Native Firebase.
6. Share the project ID and client configuration through the workspace. Admin/service-account credentials belong only in the chosen backend secret store, never chat, public Expo variables or the mobile bundle.

Project creation/billing and SMS delivery remain unverified. Firebase's published setup does not establish a blanket India DLT exemption; confirm project-specific delivery requirements with Google if this determines provider selection.

## Acceptance gates

- Firebase fictional-number sign-in works on Android and web, including wrong/expired code, resend throttling, change number, cancellation and interrupted verification. Test numbers do not prove real carrier delivery.
- Only valid tokens from the intended project are accepted. Reject wrong issuer/audience, invalid signature, expired/revoked tokens, missing phone authentication, disabled users and forged identity mapping. Use server SDK verification rather than decoding JWT payloads alone.
- Repeated/concurrent first sign-ins produce one canonical account and player. Existing users explicitly link accounts after proving ownership; metadata phone fields never authorize a merge.
- Parent completes the child's player profile; the organiser can find the canonical player and add them to an eligible team. Player-pool mode requires a registration/approval before team allocation. Existing-team mode uses the authorised roster flow. Phone verification alone is not tournament registration or parental consent.
- Confirm the chosen organiser-enrolment journey. Current pool registration is applicant-submitted then organiser-reviewed/allocated; organiser-only submission on a parent's behalf is not delivered by adding phone auth.
- Independent organiser/scorer/viewer checks preserve permissions, contact privacy and real-time scores. Unauthorized scorer commands and cross-account reads/writes fail.
- Restart, token refresh, sign-out, account switching, password/email coexistence, deletion and account-bound native offline scoring all work without losing or duplicating deliveries.
- Real SMS is tested on the intended Indian carriers and the scorer's Play-installed phone, followed by a complete five-over rehearsal with Android and web spectators.

## Sources reviewed

- [Supabase Firebase integration](https://supabase.com/docs/guides/auth/third-party/firebase-auth): external JWT access, authenticated claims and project registration.
- [Firebase ID token verification](https://firebase.google.com/docs/auth/admin/verify-id-tokens): issuer, audience, signature and token lifetime checks.
- [Android phone authentication](https://firebase.google.com/docs/auth/android/phone-auth): app verification, signing and test numbers.
- [Web phone authentication](https://firebase.google.com/docs/auth/web/phone-auth): reCAPTCHA and authorized domains.
- [Firebase authentication limits](https://firebase.google.com/docs/auth/limits): Blaze requirement for verification SMS.
- [Expo Firebase integration](https://docs.expo.dev/guides/using-firebase/): native SDK/build requirements.
