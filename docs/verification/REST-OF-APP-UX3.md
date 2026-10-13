# Rest of SportStage UX 3 review

Date: 2026-10-12. Local, uncommitted implementation; no migration or deployment.

`npm run build:check` passed: lint, strict types, 901 tests in 157 files,
environment and architecture checks, and production export of 119 web routes. The broader
connected-experience browser regression also passed with zero page errors.

The five racket sports now share Now/My game/Explore navigation, sport homes,
scoped discovery, readiness, player/server selection, review, live scoring,
spectator history/information and personal performance. My clubs retains its
existing membership and invitation commands. Competition and club/team management
details remain UX 4; Android review and deployment remain UX 5.

Scoring follows the user's [PDF reference](../design-references/racket-scoring-redesign.pdf),
which supersedes the earlier side-by-side scoring mockups. Cricket is excluded
at the user's request. The interface has stacked tappable score cards, a serving
highlight, singles/doubles avatars, 96px Inter Bold scores, round previews,
the latest rally receipt with Undo, and Point details/Match controls actions.
Colours were sampled from the supplied reference; other screens retain the
rest-of-app design tokens and typography.

All scoring comes from the existing replay engine and server commands. Tennis
notation, saved best-of rules, padel golden point, table-tennis service turns
and pickleball side-out remain sport-specific. The serving side appears first;
labels identify the actual side and any supported server number. The current
engine does not track individual serving partners in every doubles format, so
the UI does not invent a named server or receiver. Round previews are read-only.

`node scripts/e2e/verify-racket-experience.mjs` passed against the isolated local
Supabase fixture with zero page errors. It checked:

- All five sport roots and actual eligible player selection, explicit server,
  saved venue/rules, review, creation, scoring and Undo.
- 320/390/1280px layouts, matching score typography, vertically stacked cards,
  serving-first ordering and a read-only round preview.
- A rapid badminton double-tap creates one point; point-detail selection records
  that same rally once. Tennis uses Love and pickleball side-out leaves scores
  unchanged.
- A second account receives live updates and cannot obtain scoring access;
  actual lease expiry removes controls, and successful access restoration clears
  the obsolete denial message.
- Failed cloud submission preserves the saved score; reconnect/read/retry
  persists one new rally. This verifies connected scoring recovery, not an
  offline outbox for racket matches.
- Actual completion, completed spectator result, restored active scoring and
  event-derived personal performance.
- Public club discovery excludes private clubs, preserves the query through
  detail/Back/refresh, and owned private clubs remain available in My clubs.
- Controlled activity-request failure reports unavailable results and retries
  without displaying a false empty count. Controlled long participant names
  remain readable at 320px and match controls remain reachable.

The harness creates and deletes only its own local matches/clubs and restores
fixture sport preferences. Controlled long-name metadata and request failures
are visual/error checks; they do not modify real participant identities or
permissions. Public club search uses existing RLS, with no expanded privileges.

Screenshots: [Badminton](rest-of-app-ux3/badminton-scoring-390.png),
[Tennis](rest-of-app-ux3/tennis-scoring-390.png),
[Padel doubles at 320px](rest-of-app-ux3/padel-scoring-320.png),
[Table tennis](rest-of-app-ux3/table-tennis-scoring-390.png),
[Pickleball](rest-of-app-ux3/pickleball-scoring-390.png),
[Match review](rest-of-app-ux3/badminton-review-390.png),
[Spectator](rest-of-app-ux3/spectator-390.png),
[Long names](rest-of-app-ux3/long-names-controlled-320.png).
[Executed checks](rest-of-app-ux3/review.json) contain no credentials.

Native haptics, device rendering, OS sharing, hosted rollout and signed upgrade
validation are release checks. Web evidence does not establish those outcomes.
