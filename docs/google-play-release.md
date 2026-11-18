# Google Play release handoff

> Current release planning (14 October 2026): use the [Android production-access and release plan](ANDROID_GOOGLE_PLAY_RELEASE_PLAN_2026-10-14.md). The production-access request was rejected for needing more testing. The version and internal/draft assumptions below are historical; current app configuration is 2.0.0. The production submit profile now targets the existing custom closed track `SportStage - internal ` with status completed; the API identifier intentionally includes a trailing space. Version code 11 was successfully submitted on 14 October 2026; see the [build and submission record](verification/ANDROID_PRODUCTION_BUILD_2026-10-14.md).

## App identity

- Store name: SportStage
- Android package: `com.vcreativestudio.sportstage`
- Initial release: `1.0.0`
- Build artifact: Android App Bundle (`.aab`)
- Initial track: Internal testing, draft release

## Commands

Run from `mobile/`:

```sh
npm run build:check
eas build --platform android --profile production
eas submit --platform android --profile production
```

Production build numbers are managed remotely and increment automatically.

## One-time Play Console work

1. Create the app with package `com.vcreativestudio.sportstage`.
2. Enable Play App Signing.
3. Create a Google Cloud service account, grant it Play Console release access, and upload its JSON key through EAS Credentials. Never commit the key.
4. Complete the main store listing with the app icon, feature graphic, phone screenshots, short description, full description, support email, and `https://sportstageapp.com` website.
5. Publish a privacy-policy page on `sportstageapp.com` and link it in both Play Console and the app.
6. Complete App access with working reviewer credentials because most functionality requires sign-in.
7. Complete Ads, Content rating, Target audience, News apps, Data safety, and account-deletion declarations.
8. Add internal testers and review the draft release before rollout.

## Suggested listing copy

Short description:

> Run cricket tournaments, score every ball, and follow matches live.

Full description:

> SportStage brings community cricket tournaments into one live workspace. Create and manage tournaments, organize teams and rosters, generate fixtures, assign scorers, record every delivery, publish live scores, and follow standings and player performances. Wricket provides purpose-built cricket scoring while SportStage keeps each participant's tournament role and access clear.

Only advertise features that are available in the submitted build.

## Data and review notes

- Account data: email address, display name, primary sport, authentication identifiers.
- User content: tournament, team, roster, score, photo, moment, and message data entered or uploaded by users.
- Location: organizer-selected tournament venue; confirm whether device location is collected before answering Data safety.
- Photos/media: selected by users for tournament/team branding and match moments.
- Data is transmitted over HTTPS to Supabase.
- Verify an in-app and web account-deletion request flow before production rollout.
