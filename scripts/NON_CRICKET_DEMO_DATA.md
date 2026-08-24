# Non-cricket production demo data

This batch belongs to the production account `e9b888ec-f819-4ae1-b6af-914b8613ca4e` and is marked `non_cricket_demo_2026_v1` in hidden JSON metadata. The marker is never included in user-facing names or descriptions. It covers tennis, badminton, padel, table tennis, and pickleball.

The eight mock accounts are non-login player identities. They are searchable SportStage opponents with active profiles in all five sports, but they have no password or external identity.

Commands must be run from `mobile/` against the linked production project:

```sh
npm run demo:non-cricket:status
npm run demo:non-cricket:seed
npm run demo:non-cricket:clear -- --confirm DELETE_NON_CRICKET_DEMO_2026_V1 --dry-run
npm run demo:non-cricket:clear -- --confirm DELETE_NON_CRICKET_DEMO_2026_V1
```

Always run the cleanup dry-run first. The manager refuses any linked project other than `lzgnuqwvsioinwwrsdvn`. Cleanup selects only the marked competitions, scoring matches, clubs, and mock accounts; it preserves the real target account and unrelated production data.
