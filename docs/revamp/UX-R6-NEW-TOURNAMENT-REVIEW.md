# New tournament form review

Date: 2026-10-10. Phase 7 follow-up; overall phase acceptance remains open.

## Implementation and design review

Rebuilt the form against approved `new-tournament.png`, its `mockups.js` definition and `styles.css`: contextual header, “Set the stage.” introduction, compact essential fields, private organiser-contact card, optional venue/artwork/details disclosure and one fixed create action.

Space Grotesk headings, Inter 12px fields / 10px labels, IBM Plex Mono eyebrow/badge, 18px page inset, 44px inputs, 9px field corners and shared outline graphics follow the source. Reviewed loaded 376px and 320px screenshots. Start time stays alongside the overs field to retain the existing scheduling capability. The format chooser retains all six supported formats instead of the prototype's three illustrative choices.

Selecting Test (`TURF_TEST`) shows **Overs per innings** in the input's visible/accessibility label and validation message. Other formats show **Overs per match**. Existing format defaults, integer limits, squad/team requirements, contact/venue/social validation and cloud creation parameters are retained. Test still defaults to 90 overs, 11 players and its existing multi-innings rules. The legacy storage field `overs_per_match` is unchanged; no rules/schema/API migration was introduced.

Venue, logo/banner, description and social-link fields remain available and retain values when collapsed. Date/time selection uses native pickers on devices and date/time inputs on web, preserving one scheduled timestamp. Validation appears inline, scrolls into view and clears on edit. Inputs and creation controls lock during saving; a ref prevents overlapping submissions. Existing creation-error recovery retains the draft.

Review corrected a collapsed logo-picker width and stale validation messages. Fresh captures verify the Test label, full narrow layout and functional optional controls.

## Validation and evidence

- `npm run build:check` passed: lint, strict types, 132 test files / 666 tests, environment/architecture checks and Expo web export. Log: `.e2e/new-tournament-build-reviewed.log`.
- `node scripts/e2e/verify-new-tournament-form.mjs` passed on local Chrome. Covers rendered fonts, a single create action, all six format defaults, format cancellation, Test label/overs validation, name/contact/team/squad limits, date/time, optional-field retention, invalid social link and automatic feedback, logo width, 320px overflow, failed creation with preserved input, retry, and real persisted Test/Turf creation with unchanged parameters and private visibility. Log: `.e2e/new-tournament-e2e-final.log`.
- Screenshots: `.e2e/new-tournament-376.png`, `new-tournament-test-320.png`, `new-tournament-details.png`. Native picker/photo/keyboard acceptance remains part of device review.
- Only isolated local `wricket-e2e` data was created; cleanup removes the two review tournaments by their generated names and organiser ID. No hosted data or migration was changed.

This verifies the redesigned creation form, not full scorer-driven Test/tournament lifecycle acceptance. Existing Phase 7 preset/lifecycle, native/accessibility and durability gates remain tracked. Native gesture verification remains paused.
