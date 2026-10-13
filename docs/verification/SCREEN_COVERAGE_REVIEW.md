# Design-state coverage audit

The prototype inventory contains 83 states, not 83 unique routes. This table
maps each state to its implementation and prior evidence. It is a coverage
ledger, not a claim of pixel-identical browser/native acceptance for every state.
The user racket scoring PDF supersedes the original scoring prototype; cricket
retains its separately approved revamp. Real data and permissions replace sample
names, counts and results. Native review and hosted email delivery are separate
gates. Coverage 2 is validated and deployed as hky6k7mpox; accessibility acceptance is in progress.

| Design state | Implementation | Review evidence / limit |
| --- | --- | --- |
| welcome - A useful first visit | app/auth.tsx | UX2; delivery gate remains open |
| signin - Sign in, then carry on | app/auth.tsx | UX2; delivery gate remains open |
| signup - Create your account | app/auth.tsx | UX2; delivery gate remains open |
| verify - A clear verification handoff | app/auth.tsx | UX2; delivery gate remains open |
| preferences - Pick sports, skip the clutter | app/onboarding.tsx | UX2 |
| forgot - Recover without losing context | app/forgot-password.tsx | UX2; hosted delivery pending |
| check-email - Reset request acknowledged | app/forgot-password.tsx | UX2; hosted delivery pending |
| reset - Finish password recovery | app/reset-password.tsx | UX2 local recovery; hosted callback pending |
| auth-error - Expired link, visible recovery | app/auth-link-error.tsx | UX2 |
| hub - A home across sports | components/sports/platform/SportStageHomeScreen.tsx | UX1 |
| switcher - Switch sports with context | app/switch-sport.tsx | UX1 |
| my-sports - One place for your activity | components/sports/platform/MySportsScreen.tsx | UX1 |
| explore - Search with clear scope | app/explore.tsx | UX1 |
| launcher - Start with the sport | app/start-match.tsx | UX1 |
| cricket-home - Return to the Wricket revamp | app/wricket/(tabs)/live.tsx | Earlier cricket revamp retained |
| teams - Find your people | components/wricket/my-wricket/MyTeamsSection.tsx | Earlier cricket revamp retained |
| create-team - A small, focused team form | components/wricket/my-wricket/MyTeamsSection.tsx | Earlier cricket revamp retained |
| team - Team home, role made visible | app/wricket/team/[id].tsx | Earlier cricket revamp retained |
| roster - A readable roster | app/wricket/team/[id].tsx | Earlier cricket revamp retained |
| invite-player - An invitation with a role | components/wricket/teams/RosterManagementSheet.tsx | Earlier cricket revamp retained; native sharing pending |
| invite-ready - Share without ambiguity | components/wricket/teams/RosterManagementSheet.tsx | Earlier cricket revamp retained; native sharing pending |
| invite - A safe invitation landing | app/wricket/team/join.tsx | UX2 acceptance |
| join - Review, then join | app/wricket/team/join.tsx | UX2 acceptance |
| team-matches - Team matches in context | app/wricket/team/[id].tsx | Earlier cricket revamp retained |
| clubs - Clubs without another navigation layer | components/sports/scoring/SportClubsScreen.tsx | UX3 |
| club - Club identity and useful destinations | components/sports/scoring/SportClubDetailScreen.tsx | UX4 role review; Coverage2 input typography |
| club-team - A racket-sport team | components/sports/scoring/SportTeamDetailScreen.tsx | UX4 role review |
| player - One identity, clear records | app/wricket/player/[id].tsx | Earlier cricket revamp retained |
| sport-home - A familiar home for every sport | components/sports/scoring/SportScoringHome.tsx | UX3 |
| my-game - Your activity inside a sport | components/sports/scoring/SportMySportScreen.tsx | UX3 |
| sport-explore - Discovery within a sport | components/sports/scoring/SportSearchScreen.tsx | UX3 |
| matches - A match list that explains itself | components/sports/scoring/SportMatchesScreen.tsx | UX3 |
| setup - Readiness over a long wizard | components/sports/scoring/SportMatchSetupScreen.tsx | UX3 |
| players - Names before rules | components/sports/scoring/SportMatchSetupScreen.tsx | UX3 |
| rules - Rules, progressively disclosed | components/sports/scoring/SportMatchSetupScreen.tsx | UX3 |
| review - An explicit final check | components/sports/scoring/SportMatchSetupScreen.tsx | UX3 |
| scoring - Score the rally, see the receipt | components/sports/scoring/SportCloudLiveScoreScreen.tsx | UX3; user scoring PDF supersedes prototype for racket sports |
| point-details - Optional detail stays optional | components/sports/scoring/SportCloudLiveScoreScreen.tsx | UX3; user scoring PDF supersedes prototype for racket sports |
| match-controls - Controls outside the point pad | components/sports/scoring/SportCloudLiveScoreScreen.tsx | UX3; user scoring PDF supersedes prototype for racket sports |
| watch - Spectator view with its own purpose | components/sports/platform/SportCloudMatchFeedScreen.tsx | UX3; native sharing pending |
| rally-history - Updates in reading order | components/sports/platform/SportCloudMatchFeedScreen.tsx | UX3; native sharing pending |
| match-info - Facts in one place | components/sports/platform/SportCloudMatchFeedScreen.tsx | UX3; native sharing pending |
| match-result - A completed match looks completed | components/sports/platform/SportCloudMatchFeedScreen.tsx | UX3; native sharing pending |
| share-match - A deliberate sharing preview | components/sports/platform/SportCloudMatchFeedScreen.tsx | UX3; native sharing pending |
| sport-stats - A record with the right context | components/sports/scoring/SportStatsScreen.tsx | UX3; account record, not global leaderboard |
| competitions - Choose a competition, know its state | components/sports/scoring/SportCompetitionsScreen.tsx | UX4 |
| competition - Public overview before admin | components/sports/scoring/SportCloudCompetitionDetailScreen.tsx | UX4; actual data/permissions and focused sections, not fabricated prototype records |
| register - Register with the right identity | components/sports/scoring/SportCloudCompetitionDetailScreen.tsx | UX4; actual data/permissions and focused sections, not fabricated prototype records |
| comp-info - Competition facts without contact leakage | components/sports/scoring/SportCloudCompetitionDetailScreen.tsx | UX4; actual data/permissions and focused sections, not fabricated prototype records |
| comp-matches - A schedule people can scan | components/sports/scoring/SportCloudCompetitionDetailScreen.tsx | UX4; actual data/permissions and focused sections, not fabricated prototype records |
| scheduled-match - A fixture before the first point | components/sports/scoring/SportCloudCompetitionDetailScreen.tsx | UX4; actual data/permissions and focused sections, not fabricated prototype records |
| comp-standings - Standings with a real empty state | components/sports/scoring/SportCloudCompetitionDetailScreen.tsx | UX4; actual data/permissions and focused sections, not fabricated prototype records |
| create-competition - Create first, configure next | components/sports/scoring/SportCompetitionsScreen.tsx | UX4 |
| manage - The organiser’s next action | components/sports/scoring/SportCloudCompetitionDetailScreen.tsx | UX4; actual data/permissions and focused sections, not fabricated prototype records |
| entries - One queue for entry decisions | components/sports/scoring/SportCloudCompetitionDetailScreen.tsx | UX4; actual data/permissions and focused sections, not fabricated prototype records |
| entry-review - Review an entry | components/sports/scoring/SportCloudCompetitionDetailScreen.tsx | UX4; actual data/permissions and focused sections, not fabricated prototype records |
| schedule - Schedule without hidden automation | components/sports/scoring/SportCloudCompetitionDetailScreen.tsx | UX4; actual data/permissions and focused sections, not fabricated prototype records |
| officials - Permissions close to the match | components/sports/scoring/SportCloudCompetitionDetailScreen.tsx | UX4; actual data/permissions and focused sections, not fabricated prototype records |
| resources - Resources in human terms | components/sports/scoring/SportCloudCompetitionDetailScreen.tsx | UX4; actual data/permissions and focused sections, not fabricated prototype records |
| publish - Review a lifecycle change | components/sports/scoring/SportCloudCompetitionDetailScreen.tsx | UX4; actual data/permissions and focused sections, not fabricated prototype records |
| advanced - Advanced tools stay out of the way | components/sports/scoring/SportCloudCompetitionDetailScreen.tsx | UX4; actual data/permissions and focused sections, not fabricated prototype records |
| points-rules - Understand the points table | components/sports/scoring/SportCloudCompetitionDetailScreen.tsx | UX4; actual data/permissions and focused sections, not fabricated prototype records |
| recovery-tools - Explain recovery actions | components/sports/scoring/SportCloudCompetitionDetailScreen.tsx | UX4; actual data/permissions and focused sections, not fabricated prototype records |
| organisers - Know who can manage | components/sports/scoring/SportCloudCompetitionDetailScreen.tsx | UX4; actual data/permissions and focused sections, not fabricated prototype records |
| archive - Old competitions, clearly labelled | components/sports/scoring/SportLegacyCompetitionArchiveScreen.tsx | Coverage1 export/preview/production acceptance |
| archive-detail - A read-only historical record | components/sports/scoring/SportLegacyCompetitionArchiveScreen.tsx | Coverage1 export/preview/production acceptance |
| profile - Your identity across sports | app/profile.tsx | UX2 |
| public-profile - What other people see | app/player/[id].tsx | UX2; private contact excluded |
| account - Settings grouped by intent | app/account.tsx | UX2; Coverage2 confirmations in progress; actual deletion compatibility pending |
| edit-profile - Identity with privacy cues | app/account.tsx | UX2; Coverage2 confirmations in progress; actual deletion compatibility pending |
| link-record - Claim a record, don’t merge blindly | components/sports/platform/StageLegacyRecord.tsx | UX2; Coverage2 standalone route alignment |
| connected-apps - An explicit external-app boundary | app/account.tsx | UX2; Coverage2 confirmations in progress; actual deletion compatibility pending |
| notifications - Notifications lead to the task | app/notifications.tsx | UX2 |
| help - Help follows the task | app/manual.tsx | Coverage2 in progress |
| help-score - A short guide with an exit | app/manual.tsx | Coverage2 in progress |
| data-controls - Data actions with consequences | app/account.tsx | UX2; Coverage2 confirmations in progress; actual deletion compatibility pending |
| delete-account - A final deliberate confirmation | app/account.tsx | UX2; Coverage2 confirmations in progress; actual deletion compatibility pending |
| empty - A first-use state with a next step | components/sports/platform/StageUI.tsx | Shared notices across UX1-4; recovery/accessibility audit pending |
| loading - Loading without invented content | components/sports/platform/StageUI.tsx | Shared notices across UX1-4; recovery/accessibility audit pending |
| load-error - Retry exactly where you are | components/sports/platform/StageUI.tsx | Shared notices across UX1-4; recovery/accessibility audit pending |
| offline - Connectivity is not match lifecycle | components/sports/platform/StageUI.tsx | Shared notices across UX1-4; recovery/accessibility audit pending |
| access-lost - Scoring access changed | components/sports/scoring/SportCloudLiveScoreScreen.tsx | UX3; user scoring PDF supersedes prototype for racket sports |
| invite-expired - An expired invitation is recoverable | app/wricket/team/join.tsx | UX2 acceptance |
