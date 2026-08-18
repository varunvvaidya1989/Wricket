# Non-Cricket Sports Implementation Roadmap

Last updated: 2026-08-17

This document is the implementation source of truth for Tennis, Badminton,
Padel, Table Tennis, Pickleball, and future non-cricket sports in SportStage.
Cricket remains on its existing domain and database model.

## Status legend

- `COMPLETE`: implemented, migrated where necessary, tested, and committed.
- `IN PROGRESS`: implementation has started but acceptance criteria are not all met.
- `BLOCKED`: work cannot continue until the recorded dependency is resolved.
- `PENDING`: approved scope that has not been started.

Status is changed to `COMPLETE` only after the phase acceptance criteria pass.
Every completed phase must add an entry to the implementation log with its date,
commit, migrations, tests, and any deferred work.

## Approved product decisions

- Every player is a SportStage account; guest or free-text player identities are
  not permitted in persisted clubs, teams, squads, leagues, or matches.
- A person has one basic account. Owner, organizer, captain, and match-official
  capabilities come from contextual access assignments, not global admin,
  power-user, or scorer account types.
- A tournament is entered by team squads. A league is entered by individual
  players.
- All current and future non-cricket sports support singles and doubles.
- Tournament owners schedule every fixture manually. SportStage does not
  automatically generate draws.
- Only a competition owner or an assigned match official can score a match.
- Guests can view a limited public live snapshot without an account. Detailed
  scorecards, insights, follows, and cross-sport player statistics require a
  SportStage account.
- A separate public SportStage landing page surfaces live tournaments and
  matches across sports. Signed-in users can enter each sport app for details.
- Team racquet and padel competitions may consist of three to five individual
  singles/doubles rubbers. The club squad winning the required majority wins
  the overall team tie.
- The default individual rubber is best of three games unless a sport-specific
  ruleset explicitly overrides it.

## Phase 1 — Platform foundation

Status: `COMPLETE`

Objective: establish safe shared foundations without changing the cricket
domain or prematurely enabling unfinished cloud features.

Delivered:

- Independent routes and shared three-tab shells for Tennis, Badminton, Padel,
  Table Tennis, and Pickleball.
- Shared singles/doubles scoring engine, sport rule configurations, score views,
  match setup, local competition views, profile drawer, and sign-out access.
- Sport catalog activation and account access for the five initial sports.
- Separate cloud tables for feature flags, clubs, reusable teams, contextual
  access, competitions, stages, entries, tournament squads, squad members,
  league players, and append-only audit history.
- Strict tournament-squad versus league-player entry separation.
- Account-backed participant, same-sport, accepted club membership, reusable
  team membership, and one-squad-per-division database invariants.
- Read-only client grants with RLS-filtered access; future mutations must use
  trusted server commands.
- Server-controlled feature flags shipped disabled.
- Manual-only fixture scheduling in the local competition prototype.
- Account ownership required for newly created competitions and matches.
- Table Tennis aligned to the approved best-of-three default.

Acceptance evidence:

- Remote migrations `20260816090000`, `20260817120000`, and `20260817124500`
  applied successfully.
- Remote schema lint passed with no errors.
- All 25 linked-database pgTAP/RLS assertions passed.
- Lint, strict TypeScript, environment and architecture checks passed.
- All 56 test files and 265 tests passed.
- Web export generated all 83 routes.
- Commit `294f376` (`Add non-cricket competition foundation`) pushed to
  `origin/master`.

## Phase 2 — Account-backed players, clubs, and reusable teams

Status: `COMPLETE`

Objective: replace free-text local entrants with real SportStage identities and
provide the reusable club/team roster model used by later competition phases.

Scope:

- Search and select SportStage accounts with an active profile for the chosen
  sport.
- Create and manage sport-specific clubs.
- Invite, accept, reject, leave, and remove club members.
- Create reusable teams within a club and maintain their rosters.
- Assign and revoke contextual club-manager and team-captain access.
- Require accepted membership in the same club before team membership.
- Record singles/doubles eligibility for every supported sport.
- Register individual account-backed players in leagues.
- Register account-backed club squads in tournaments.
- Snapshot tournament squads so later reusable-team changes do not rewrite
  competition history.
- Prevent duplicate membership and representation across squads in the same
  competition division.
- Add player, invitation, membership, club, team, and roster screens.
- Implement trusted server commands and audit events for every mutation.

Acceptance criteria:

- No Phase 2 workflow can persist a guest or free-text player identity.
- Cross-sport profiles cannot be added to a club, team, squad, or league.
- Invitation and membership state transitions are authorization checked and
  idempotent.
- Owners, managers, captains, members, and outsiders see only permitted data
  and actions.
- Unit, integration, migration, and RLS tests cover the complete workflow.

## Phase 3 — Cloud competitions, registration, and manual scheduling

Status: `IN PROGRESS`

Objective: replace the device-local competition prototype with server-backed
tournaments and leagues governed by an explicit lifecycle.

Scope:

- Owner creation and management of tournaments and individual-player leagues.
- Draft, registration, publication, live, completion, cancellation, archival,
  and ownership-transfer workflows.
- Registration windows, divisions, approvals, withdrawals, disqualifications,
  and roster locks.
- Owner-defined stages and labels without automatic draw generation.
- Manual creation, ordering, rescheduling, and cancellation of fixtures.
- Venue, court, timezone, start-time, check-in, and schedule-version handling.
- Optimistic concurrency and idempotency for schedule mutations.
- Owner/organizer permissions and complete audit history.
- Competition overview, entrants, fixtures, points, and officials interfaces.

Acceptance criteria:

- Tournament entries are squads and league entries are individual players.
- Only authorized owners/organizers can mutate competition configuration or
  schedule.
- Published schedules are stable, versioned, and safe under concurrent edits.
- No endpoint or interface offers automatic draw generation.
- Cloud and UI lifecycle tests pass across every supported sport.

## Phase 4 — Team ties, format templates, and lineup submission

Status: `IN PROGRESS`

Objective: model club-squad versus club-squad team matches as an ordered series
of individual rubbers.

Scope:

- Owner-drafted team ties containing any positive number of ordered matches.
- Singles, doubles, and mixed-doubles rubber types.
- Standard templates such as three singles plus two doubles and mixed-team
  combinations.
- Gender/category eligibility where required by competition rules.
- Per-tie lineup submission by captains from locked eligible squad rosters.
- Submission deadlines, revisions, reveal policy, approval, and immutable
  lineup snapshots once play begins.
- Rules limiting how many rubbers a player may contest and whether singles plus
  doubles participation is allowed.
- Duplicate-player, incomplete-pair, eligibility, and schedule-conflict
  validation.
- Predetermined order of play and controlled owner/official overrides with an
  audit reason.
- Majority threshold and early tie-clinch calculation while retaining all
  scheduled rubber records.

Acceptance criteria:

- Invalid or ineligible lineups cannot be submitted or started.
- Both squads are represented by account-backed players from their locked
  tournament snapshots.
- Rubber order and player restrictions are deterministic and server enforced.
- The overall tie winner is calculated correctly for every supported template.

## Phase 5 — Authorized scoring and resilient match synchronization

Status: `PENDING`

Objective: deliver production scoring for standalone matches, league fixtures,
and team-tie rubbers across all non-cricket sports.

Scope:

- Competition-owner and explicitly assigned match-official scoring access.
- Match-level official assignment without a global scorer account type.
- Server-authoritative immutable scoring events and derived score state.
- Sport-specific scoring, service, end changes, options, retirement,
  walkover, abandonment, correction, undo, and completion rules.
- Explicit doubles player order and server/receiver identity rather than only
  side-level service state.
- Offline event queue, retry, idempotency, conflict detection, reconciliation,
  and recovery from interrupted scoring sessions.
- Device handoff and protection against simultaneous unauthorized scorers.
- Read-only spectator mode for signed-in users who cannot score.
- Match linkage to fixtures, team ties, entrants, and lineup snapshots.

Acceptance criteria:

- Unauthorized users cannot write scoring events or alter match state.
- Replaying the immutable event log always produces the same result.
- Duplicate or reordered offline submissions cannot corrupt a match.
- Singles and doubles service rules pass sport-specific regression suites.
- Completed match results propagate exactly once to their fixture or rubber.

## Phase 6 — Results, standings, points, and player statistics

Status: `PENDING`

Objective: convert validated match results into competition outcomes and a
cross-sport player record.

Scope:

- Owner-configurable, versioned points systems and tie-break criteria.
- League standings from completed individual matches.
- Tournament squad standings and team-tie majority results.
- Rubber-level and overall tie result displays.
- Manual stage progression and owner scheduling of subsequent fixtures; no
  automatic draw generation.
- Corrections, reversals, abandoned results, and deterministic recomputation.
- Sport, format, opponent, competition, and date-based player statistics.
- Doubles partnership and team contribution statistics.
- Historical snapshots that remain stable after profile or roster changes.

Acceptance criteria:

- Recalculation from authoritative results is deterministic and idempotent.
- Points-rule changes are versioned and never silently rewrite published
  history.
- Corrections update all dependent tables without double counting.
- Users can view unified statistics across all their connected sports.

## Phase 7 — Public live discovery, following, and detailed viewing

Status: `PENDING`

Objective: provide a public SportStage front door while preserving the approved
boundary between guest snapshots and account-only detail.

Scope:

- Separate public landing page showing current live tournaments and matches
  across all sports.
- Guest-safe live snapshots with sport, competition, participants, status, and
  headline score only.
- Public competition discovery and shareable links.
- Account gate for detailed scorecards, timelines, insights, player statistics,
  and sport-app navigation.
- Signed-in following of matches, players, teams, clubs, and competitions.
- Personalized cross-sport following feed.
- Privacy-aware public player/profile cards.
- Cache, pagination, rate-limit, abuse-prevention, and stale-live-state handling.

Acceptance criteria:

- Guests can reach live snapshots without creating an account.
- Private, draft, unpublished, and account-only fields never enter guest
  responses.
- Detailed views consistently require authentication.
- Follow state and feeds work across every connected sport.

## Phase 8 — Notifications, operations, and production rollout

Status: `PENDING`

Objective: harden the completed platform for controlled production release.

Scope:

- Notifications for invitations, registration decisions, lineup deadlines,
  schedule changes, official assignments, match start, and final results.
- In-app notification center and deep links into the correct sport app.
- Observability for command failures, sync conflicts, scoring latency, public
  feed freshness, and authorization denials.
- Administrative support tooling based on audited, narrowly scoped operations;
  no global product power-user role.
- Data retention, account deletion, ownership transfer, archival, and recovery
  procedures for the new domain.
- Accessibility, responsive web/mobile behavior, performance, load, security,
  and disaster-recovery testing.
- Gradual per-sport rollout using the Phase 1 feature flags, with rollback and
  post-release monitoring.

Acceptance criteria:

- Security and RLS suites pass against the release database.
- Load and recovery targets are documented and met.
- Each feature flag has an owner, rollout sequence, monitoring signal, and
  rollback procedure.
- Release checklist passes on supported web and native targets.

## Implementation log

### 2026-08-17 — Phase 1 completed

- Status changed from `IN PROGRESS` to `COMPLETE`.
- Commit: `294f376` (`Add non-cricket competition foundation`).
- Migrations: `20260816090000`, `20260817120000`, `20260817124500`.
- Validation: remote schema lint, 25 linked pgTAP/RLS assertions, 56 test files,
  265 tests, strict TypeScript, lint, architecture checks, and 83-route web
  export passed.
- Review corrections: removed automatic draws, required account ownership for
  new competitions and matches, tightened owner/official authorization,
  searched ordinary accounts for official assignment, and changed Table Tennis
  to best of three.
- Deferred to Phase 2: replacing the current free-text local entrant prototype
  with account-backed invitations and reusable rosters.

### 2026-08-17 — Phase 2 completed

- Status changed from `IN PROGRESS` to `COMPLETE`.
- Commit: `e4007e3` (`Add account-backed sport rosters`).
- Migrations: `20260817140000`, `20260817143000`, `20260817150000`,
  `20260817151500`.
- Validation: remote schema lint, 29 linked pgTAP/RLS assertions, 57 test
  files, 275 tests, strict TypeScript, lint, environment and architecture
  checks, and a 98-route web export passed.
- Delivered: same-sport player search; trusted, audited club/team/access
  commands; private invitation previews; reusable rosters; manager and captain
  assignments; membership leave/remove actions; singles/doubles eligibility;
  and account-backed league and tournament registration across all five sport
  apps.
- Review corrections: blocked direct sport-profile self-provisioning, hid
  account identifiers outside contextual roster access, made invitation retries
  idempotent, fixed typed leave/remove transitions found by remote schema lint,
  rejected guest identities at the local persistence boundary, and blocked a
  reusable tournament squad from entering scoring before a lineup exists.
- Deferred work: server-backed competition registration and roster locking are
  Phase 3; team-tie templates and lineup submission are Phase 4; cloud player
  statistics and public player cards are Phases 6 and 7.

## Phase completion update template

Copy this section into the implementation log when a phase is completed:

```text
### YYYY-MM-DD — Phase N completed

- Status changed from `IN PROGRESS` to `COMPLETE`.
- Commit: <hash> (<summary>).
- Migrations: <identifiers or none>.
- Validation: <tests, database checks, builds, and manual checks>.
- Review corrections: <issues found and resolved>.
- Deferred work: <explicitly assigned future phase or none>.
```
