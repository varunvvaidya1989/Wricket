# Signed Android upgrade and recovery rehearsal

11 October 2026. Android scope, as requested. EAS produced two signed release
candidates using the existing production credentials. Both installed over the
previous signed application on the dedicated Wricket_E2E Android 14 emulator
without clearing data. The personal emulator and existing debug app were retained.
No Play submission was performed.

| Binary | Version code | EAS build |
| --- | --- | --- |
| Previous production 2.0.0 | 8 | `83304d38-6132-445f-96f3-c801115e46c8` |
| Current production 2.0.0 | 9 | [Production candidate](https://expo.dev/accounts/vcreativestudio/projects/sportstage/builds/83d3f2f9-d263-4e87-83f6-1c4807136ab0) |
| Recovery presentation 2.0.0 | 10 | [Recovery candidate](https://expo.dev/accounts/vcreativestudio/projects/sportstage/builds/e0b67417-ad05-4298-b9a8-8f1bcfc46440) |

The downloaded AABs were converted into universal APKs with official bundletool
1.18.3 and the existing release keystore. `apksigner` verified every APK;
`aapt2` confirmed the production package and absence of the debuggable flag.
Certificate SHA-256:
`d427feef766002969f76c47b537acf4201e43a9ad785d7321c71b6039c5f10c2`.
Both upgrades used only `adb install -r`. The installed app ID 10191 and first
installation time `2026-10-11 16:06:16` remained unchanged across 8 → 9 → 10.

## Observed behavior

- The actual previous release created scoring records through its UI. One active
  match had six legal balls, two runs, NEXT_BOWLER and one offline command. A
  second had a wide, a retired-hurt batter, NEXT_BATTER and one offline command.
- Offline replacement with version 9 preserved all match, innings, ball, session
  and outbox records byte for byte before first launch. Migration 15 ran once,
  added the pinned `revamp-v1` session version and retained prompt fields, event
  payloads, attempt counts and history.
- Reconnecting restored both prompt types. Each original client event ID appeared
  exactly once on the server; local queues drained. A second cold reconnect left
  server event IDs and sequences unchanged.
- Version 9 then created six numeric offline deliveries and a required bowler
  prompt. Installing version 10 offline retained every record. Cold offline
  opening displayed the saved prompt and kept the active `revamp-v1` session.
  Reconnection applied all six original IDs once. An additional offline delivery
  was replayed with an independent authenticated Realtime viewer; the score
  converged to six runs/seven legal balls, with all seven queued IDs represented
  once. Another reconnect left the server history unchanged.
- The existing session retained 52dp numeric keys (137 emulator pixels). A new
  session selected `recovery-v1`, rendered 60dp keys (158 pixels), recorded two
  runs and resumed offline after a cold launch. Both Numbers and Gestures options
  remain present; gesture calibration remains paused at the user's instruction.

## Scope and limitations

The previous binary's general tournament sync requests a contact column whose
broad read permission was removed by the hosted privacy migration. For this
rehearsal, a separate same-certificate instrumentation helper initialized only
the two scoped test teams in its cache, representing an already cached prior
installation. No match, innings, scoring session, prompt, ball or outbox was
seeded locally: the previous app created all scoring data through its UI. Hosted
contact permissions were retained. This limits cold-sync compatibility coverage
for the previous release.

Version 8 does not persist the newer account/match scoring authorization cache.
The first version 9 launch while entirely offline retained all SQLite scoring
data but opened the profile setup gate. One connected authorization was required
before the scoring UI could resume. After that connection, 9 → 10 and new
recovery-session cold offline resume passed. Do not claim fully offline first
authorization for an 8 → 9 upgrade.

This is an actual signed-binary emulator rehearsal. Installation over a physical
phone's existing app and a Google Play signing certificate was not tested. Play
App Signing may use a different certificate from the EAS keystore. Physical
accessibility/performance/picker checks and pilot sign-off remain open. iOS was
excluded by the user; no iOS release was produced.

## Evidence and repeat procedure

Ignored `.e2e/signed-release/` contains `binaries.json` (APK/AAB SHA-256 hashes),
both `upgrade-*.json` install identities, baseline/install/migration snapshots,
`reconnect9-evidence.json`, `recovery10-evidence.json`, UI evidence and screenshots.
`production-source.json` and `recovery-source.json` identify the uncommitted tree
at each build submission; HEAD alone does not identify this candidate. Test
helpers and documentation added later are not part of those submitted binaries.
Private credential copies and fixture passwords are not release evidence.

Create a fresh scoped hosted fixture with `signed-release-fixture.mjs --seed
--production`. Use the previous actual artifact, initialize only the fixture's
test-team cache if needed, create prompts and queued events through the app,
then inspect with the separate signed helper while the app is stopped. The
driver refuses another emulator, debug artifacts, mismatched certificates or a
non-increasing version code. `verify-signed-release-reconnect.mjs` checks the
saved version 8 baseline after upgrading to 9;
`verify-signed-recovery.mjs` checks the saved version 9 baseline after upgrading
to 10. They expect their matching private fixture and saved snapshots; they are
not destructive reset scripts.

After verification, restore the original emulator network state, remove the
separate inspection APK and delete only the tagged hosted acceptance fixture.
Keep the main signed app and its SQLite database. Recovery uses a higher-version
binary: native OTA updates are disabled. Retain additive hosted migrations and
privacy permissions during presentation recovery.
