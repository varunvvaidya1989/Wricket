# Android production build: 14 October 2026

Status: BUILD COMPLETE and SUBMITTED to the existing Google Play closed-testing track. Production-access approval remains pending.

- App: SportStage 2.0.0, Android version code 11.
- Package: com.vcreativestudio.sportstage.
- EAS production build: [03afb41c-b0f8-4c56-bd5c-82c30fc551d1](https://expo.dev/accounts/vcreativestudio/projects/sportstage/builds/03afb41c-b0f8-4c56-bd5c-82c30fc551d1).
- [Signed AAB download](https://expo.dev/artifacts/eas/qBZ5zKicroFX535SUzl9ih9d5vv0BWo5xk2KhJvuQOU.aab).
- Source: 8e47357e79090bfeb81ecf71ce976ee225d9dee4 plus the current uncommitted changes; recorded source fingerprint `54f1c379f73b387da3085c3895eb113c4502d8b80166b54b99847326c9bfd2e6`. Workspace fingerprint matched the build-request record before adding this report.
- Profile: production; production EAS environment; existing remote credentials frozen during this request. No automatic Play submission.

The downloaded AAB passes official bundletool 1.18.3 validation and JAR signature verification. Its base manifest confirms version 2.0.0 (11), the production package, min API 24, target API 36, non-debuggable status and sportstage scheme without sportstage-e2e. Upload signing certificate SHA-256 `d427feef766002969f76c47b537acf4201e43a9ad785d7321c71b6039c5f10c2` matches the previously inspected EAS release certificate; this is not a verification of the separate Play App Signing certificate.

AAB SHA-256: `161e29fdda6190f952a724ecbd1bc477fea01bfc996a286d7065d37ef5ed5375`.

The current application source inherited the completed 939-test/full web build gate and reviewed web deployment. Creating this AAB does not establish physical-device, Play-installed upgrade, 16KB runtime, email delivery, tester engagement or policy acceptance. Follow [the Android release plan](../ANDROID_GOOGLE_PLAY_RELEASE_PLAN_2026-10-14.md) before reapplying for production access. Gesture verification remains paused.

Ignored local evidence: `.e2e/android-production-2026-10-14/` contains the source record, EAS build metadata, original AAB, validation, manifest, signing verification and inspection summary. Credentials were not copied or published.

## Play submission attempt

14 October 2026: user authorised Play submission. EAS submission da4bba5e-9e09-4eed-a109-e9b59d382087 targeted the configured alpha closed-testing track with release status completed and stored EAS service-account credentials. Google rejected the commit: `Release in track targeting no countries`. EAS submission failed; this is not a successful rollout or an app-policy review result. The production AAB remains valid. Required next step: configure target countries for the intended closed track (or identify the existing cohort track), then retry this same build. No new Android build is needed.

## Corrected closed-track submission

After the user identified the existing track, an authorised Play API read found `SportStage - internal ` (including a trailing space), with India enabled and version 8 completed. This is a custom closed-testing track, distinct from the built-in internal track and the unused alpha track. EAS submission configuration was corrected after the AAB build; the app binary did not change.

[Submission 470cfd71-698e-4ee2-81f5-45511c6ab6d7](https://expo.dev/accounts/vcreativestudio/projects/sportstage/submissions/470cfd71-698e-4ee2-81f5-45511c6ab6d7) succeeded on 14 October 2026. An independent Play API read confirmed version code 11, release name 2.0.0 and status completed on that exact track with IN enabled. Read transactions were discarded; credentials were used in memory and never printed or saved. This confirms submission/track assignment, not production-access approval or a physical tester install.
