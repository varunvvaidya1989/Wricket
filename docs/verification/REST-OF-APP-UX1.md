# Rest of SportStage UX 1 review

Date: 2026-10-12. Implementation: validated, uncommitted. No migration or hosted
deployment. The completed cricket revamp and non-cricket domain rollout remain
separate from this presentation phase.

Design reference: `../../../docs/UI Designs/wricket-rest-of-app/exports/`, states
`hub`, `my-sports`, `explore`, `switcher`, `launcher`.

The implementation uses the reference background `#0b100e`, surface `#151c18`,
text `#f0f4ef` and accent `#a6f477`. Browser checks verified Space Grotesk 600
at 29px for page titles, Inter 400 at 12px for introductory copy and IBM Plex
Mono 500 at 10px for section labels. Review compared the two-column tiles,
letter graphics, named header, avatar, framed Back control, top navigation,
secondary buttons and list spacing. Text and fixture counts come from existing
APIs rather than the illustrative prototype accounts.

User-requested update on 2026-10-12: sport cards now use bundled photographs
and sport equipment icons. Explicit image dimensions, `contain` sizing and a
640:420 photo area preserve each complete photograph on mobile. Review at
320px and 390px confirmed all six subjects are visible without horizontal
overflow. [320px review](sport-card-review/home-320.png),
[390px review](sport-card-review/home-390.png). Photographs and source attribution
are in [the asset catalogue](../../assets/sportstage/sports/SOURCES.md).

Validation passed:

- `npm run build:check`: lint, types, 864 tests / 154 files, environment and
  architecture checks, production web export / 119 routes.
- `node scripts/e2e/verify-connected-experience.mjs`: local Supabase only;
  320/390/1280 widths; zero page errors; no horizontal page overflow.
- Guest sign-in preserves the selected cricket setup. An unconnected Badminton
  selection carries its destination through account save and profile refresh.
- Real team search opens the existing team detail; Back and direct refresh retain
  the query and category. Explore keeps filters separate from navigation and
  exposes their checked state to accessibility tools.
- Failed live requests display an error with retry rather than empty matches.
  Private racket directories are requested only for connected sports.

Screenshots: [Home](rest-of-app-ux1/home-390.png),
[My sports](rest-of-app-ux1/my-sports-390.png),
[Explore](rest-of-app-ux1/explore-390.png),
[Switcher](rest-of-app-ux1/switcher-390.png),
[Launcher](rest-of-app-ux1/launcher-390.png),
[Load failure](rest-of-app-ux1/home-load-error-390.png).

[Live card](rest-of-app-ux1/home-live-layout-390.png) uses a controlled response
for visual review; this is a UI fixture, not evidence of a persisted live match.
The [machine-readable review](rest-of-app-ux1/review.json) records executed checks.
All 320/390/1280 screenshots are also retained locally under
`.e2e/rest-of-app-ux1/`; no credentials are included in the review artifacts.

Limits: web evidence does not establish Android rendering, physical-device
behaviour, or signed upgrade compatibility for this new UI. Those are UX 5 gates.
Account and authentication presentation is UX 2; racket sport shells and broader
club/team discovery are UX 3. Existing scoring leases and server permissions
continue to govern the actual setup/scoring destinations.
