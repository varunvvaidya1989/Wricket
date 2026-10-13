# Archive and fallback review

Design references: rest-of-app `archive` and `archive-detail` exports. All five
racket sports share the archive implementation. The legacy writable competition
component is not routed; it is not part of this release's claimed coverage.

Archive list/detail and feature-unavailable screens now use the focused Stage
layout, Space Grotesk / Inter / IBM Plex Mono, current surfaces and grouped rows.
Records remain read-only and local to the device. Empty/missing fixtures and
entrants are explicit. No example winner or result is fabricated: the stored
competition model does not contain those fields. Current competitions remain
reachable from every archive state.

Archive read failures retain a retry action. Request generations prevent stale
responses after route/sport changes. The fallback no longer describes a completed
rollout as still being validated; it accurately describes unavailable access and
provides sport/archive destinations. No migration or feature-flag change.

Validation passed: full build gate, responsive browser review, populated
and missing archives, controlled storage failure/retry and disabled-feature
fallback. The accepted preview was promoted as deployment pdb79xgsdb; production acceptance also passed. Physical Android is
unavailable by user instruction and remains a separate gate.

906 tests in 157 files, types, environment/architecture and 119-route export passed. Focused lint passed after a duplicate import was removed. Full export/preview organiser regressions passed; focused visual acceptance repeated export/preview/production after fixing launch-overlay capture timing. All final reports have zero browser errors and confirmed fixture cleanup. No app rebuild was needed for this test-only capture correction.

Production bundle SHA-256: 88627feed00270fe226bcdf768493ba3d16a8447e16b7e2d22e5c60e072891a1. Previous production/rollback: oamho42ghy. Evidence: rest-of-app-coverage1/.
