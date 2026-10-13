# Web accessibility and recovery review

Date: 2026-10-13. Status: IN PROGRESS; production remains Coverage 2 (hky6k7mpox) until preview acceptance.

Shared pages now provide document titles, a main landmark and meaningful headings. Top-level navigation uses named navigation buttons instead of incomplete tab semantics. Organiser forms have persistent visible labels; image-only controls have accessible names and 44px targets. Dialogs are named, eligibility toggle buttons expose their selected state, and invalid fields reference their error messages. Decorative avatars do not repeat surrounding names. The loading animation respects reduced motion and launch status is announced.

Validation uses the complete-page default axe rule set with no exclusions or disabled rules, plus keyboard activation, focus trapping, Escape cancellation, 320px layout and 200% zoom. Browser fixtures are disposable and ownership is checked before cleanup. Scans wait for dialog activation after animations, rather than measuring partially transparent transitions. Incomplete icon-font contrast results are retained for manual review. Automated scans do not certify every assistive-technology or native state.

Existing responsive form checks and the organiser workflow include failure/retry and actual offline/reconnect lifecycle submission. Live racket keyboard scoring uses a scoped test match. Cricket gesture verification remains paused. Android hardware and signed upgrade checks remain unavailable; actual hosted email delivery and account deletion compatibility belong to Coverage 4.

References: [Playwright accessibility testing](https://playwright.dev/docs/accessibility-testing). Final acceptance evidence and deployment will be recorded after review.
