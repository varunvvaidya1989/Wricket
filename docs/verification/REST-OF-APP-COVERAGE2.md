# Forms, help and identity review

Date: 2026-10-13. Status: VALIDATED - deployed hky6k7mpox.

The 83-state ledger in SCREEN_COVERAGE_REVIEW.md maps prototype states to actual
routes/panels. It distinguishes existing cricket presentation, the newer racket
scoring PDF, previous acceptance and outstanding native/delivery gates. It does
not assert that 83 separate screens or all native states have passed visual tests.

Help now begins with tasks and opens a short guide with contextual Back,
search and a real match-launch action. Guide routes survive refresh. Point
classification is optional and cricket retains Numbers / Gestures scoring.
Existing detailed topics remain discoverable. The standalone AuctionYodha
record-link route uses the shared account review instead of an automatic exit
or a second navigation header; matching, verified confirmation and request
permissions remain in their original API. Its app boundary is explicit.

Device clearing and account deletion have separate, cancellable review screens.
Deletion requires typed DELETE; cancellation resets it. The final action uses
red with dark foreground and a persistent footer. Errors remain inline and
rapid confirmation is guarded synchronously. No real user account or scoring
queue is cleared during presentation acceptance. Actual deletion compatibility
is Coverage 4. Data review resets on account/section changes.

Competition and club editor inputs use 13px Inter Regular. Account buttons use
scoped 13px Space Grotesk. The record-link review resets stale success on profile
changes and locks repeat requests. Domain permissions and media handling remain
unchanged. No migration in this phase.

Review corrections so far: obsolete help-search source assertion, destructive
colour/footer and data introduction, inherited record-link header, and browser
assertions that expected raw backend messages rather than the friendly fallback.
Validation and deployment evidence will be recorded after acceptance.

Full build gate passed: 906 tests in 157 files, lint, strict types, environment/architecture checks and 119-route web export. Export, preview and production responsive acceptance passed with zero browser errors and disposable fixture cleanup. Source review and representative browser states complement the 83-state mapping; this is not exhaustive native or assistive-technology certification.

Release review caught a stale font in the first export and rejected it; clean export and reacceptance corrected it. The first promoted deployment later returned a different bundle at both immutable preview and production URLs. This was not attributed to caching without proof. A fresh deployment of the reviewed source was accepted at preview and production. EAS applies production environment substitutions to the uploaded artifact, so its final bundle was compared again byte for byte with the resulting local artifact. Final production: hky6k7mpox, SHA-256 a4bb30024966418a32f13bb285207b40d4cb27d9a6429e527446651fd3113175. Rollback: pdb79xgsdb. Evidence: rest-of-app-coverage2/. Actual deletion compatibility and email delivery remain Coverage 4; Android remains unavailable.
