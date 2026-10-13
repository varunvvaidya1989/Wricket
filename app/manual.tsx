import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { StageButton, StageField, StageIntro, StageList, StageNotice, StagePage, StageRow, StageText, stageColors as colors } from '@/components/sports/platform/StageUI';

type ManualSection = {
  id: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
  summary: string;
  path: string;
  steps: string[];
  note?: string;
};

const sections: ManualSection[] = [
  {
    id: 'account', icon: 'account-circle-outline', title: 'Set up your player account',
    summary: 'Choose sports, set a primary sport, and make yourself available for matches.', path: 'Profile picture → Edit profile & account',
    steps: [
      'Open Edit profile & account and select every sport you play or follow.',
      'Choose one selected sport as your primary sport. It becomes your default SportStage experience.',
      'Save your profile. SportStage creates an active player profile for each selected sport.',
      'You can change sports later without creating a second login.',
    ],
    note: 'Only players with the same active sport can be selected together for a match.',
  },
  {
    id: 'match', icon: 'account-multiple-plus-outline', title: 'Create an individual match',
    summary: 'Start a singles or doubles match outside a tournament.', path: 'Open a sport → Start scoring',
    steps: [
      'Choose Singles or Doubles and review the suggested rules for that sport.',
      'Tap a player slot. Search the SportStage player directory in the selection dialog.',
      'You may select yourself in any one slot. Fill the other slots with players who have selected the same sport.',
      'Review the sides and rules, then create the match.',
      'Use Start scoring when play begins. Scheduled matches remain under Matches until started.',
    ],
  },
  {
    id: 'competition', icon: 'trophy-outline', title: 'Create a tournament or league',
    summary: 'Set up the public information, organizers, rules, and registration.', path: 'Open a sport → Competitions → Create',
    steps: [
      'Choose Tournament for bracket or team-tie play, or League for standings-based play.',
      'Add the name, dates, time zone, description, logo, banner, venue, and organizer contact details.',
      'Set the expected number of players or teams and choose Public or Private visibility.',
      'Review the sport-specific match rules. Defaults follow that sport, but permitted settings can be adjusted.',
      'Save the competition, add divisions if needed, then open registration or publish it when ready.',
    ],
    note: 'Draft competitions are visible to their owner and organizers. Public viewers see them after publication.',
  },
  {
    id: 'participants', icon: 'account-group-outline', title: 'Add clubs, teams, and entrants',
    summary: 'Build reusable rosters and register them in a competition.', path: 'Open a sport → Clubs or Competition → Entrants',
    steps: [
      'Create a club if you manage a recurring group of players.',
      'Invite SportStage players to the club, then create teams from active members.',
      'Open a competition’s Entrants tab and add a player or team to the correct division.',
      'Approve pending entries. Rejected, withdrawn, or disqualified entries cannot be scheduled.',
      'For team ties, add squad players before preparing individual match lineups.',
    ],
  },
  {
    id: 'schedule', icon: 'calendar-clock-outline', title: 'Schedule and prepare fixtures',
    summary: 'Choose opponents, time, court, match order, officials, and lineups.', path: 'Competition → Manage competition → Schedule & courts',
    steps: [
      'Lock registration, then choose two approved entrants from the same division in Schedule & courts.',
      'Select the stage, venue, court, and local start time.',
      'For a tournament team tie, add its singles or doubles matches in playing order.',
      'Open Manage fixture to record attendance, change time or court, reorder, edit matches, or cancel.',
      'Set each team-tie lineup, then Confirm lineups before scoring starts.',
      'Assign a scorekeeper or referee from the Officials tab when someone else will score.',
    ],
    note: '“Present,” “Late,” and “No show” are attendance records. They do not award points by themselves.',
  },
  {
    id: 'scoring', icon: 'scoreboard-outline', title: 'Score a live match',
    summary: 'Award points, describe how they were won, and let the sport engine apply its laws.', path: 'Match card → Start scoring',
    steps: [
      'Confirm the players and server, then start the match.',
      'Award the point to the player or side that won it.',
      'Tap the winning side to record a rally. Use Point details when you want to classify how the point was won.',
      'SportStage applies the selected sport’s game, set, advantage, deuce, and tie-break rules automatically.',
      'Use Undo only for the most recent incorrect action. The live score and timeline update for viewers.',
      'Complete the match after the winning condition is reached and verify the result.',
    ],
    note: 'For example, a double fault is recorded against the server while the point is awarded to the receiver.',
  },
  {
    id: 'watch', icon: 'access-point', title: 'Watch live and upcoming sport',
    summary: 'Find public matches, open the live timeline, and follow competitions.', path: 'SportStage → Now / Explore, or a sport → Now',
    steps: [
      'Open Now or Explore to find public live matches across sports.',
      'Open an individual sport’s home or Live screen to filter the feed to that sport.',
      'Select a match to see player names, the current score, and point-by-point descriptions.',
      'Follow a public competition to include it in your following feed and upcoming schedule.',
      'Live indicators animate while new scoring events are arriving; no manual refresh is normally required.',
    ],
  },
  {
    id: 'results', icon: 'chart-box-outline', title: 'Results, standings, and statistics',
    summary: 'Understand what changes after a match is completed.', path: 'Competition → Standings / Points, or sport → Stats',
    steps: [
      'Completed matches remain available under Matches and on the competition schedule.',
      'League standings use the published win, draw, loss, and walkover point values.',
      'Tournament and league pages show match totals, entrants, venues, organizer details, and player statistics.',
      'Open a player profile to see their cross-sport identity and available career summaries.',
      'Competition managers can rebuild standings if an amended result needs to be reflected.',
    ],
  },
  {
    id: 'help', icon: 'lifebuoy', title: 'Fix common problems safely',
    summary: 'What to check when a player, competition, or live score is missing.', path: 'Competition → Manage competition, or Account & privacy',
    steps: [
      'Missing player: confirm both accounts selected the same sport and have active profiles.',
      'Missing competition: confirm you are signed in, viewing the correct sport, and the competition is published for public discovery.',
      'Score not live: confirm the match was started, the competition is public, and the scorer has permission.',
      'Stale view: reopen the screen or use Refresh public snapshots from Competition → Manage.',
      'Offline issue: reconnect before handing scoring to another device so queued actions can synchronize.',
      'Clear device data only for corrupted local downloads. It does not delete cloud matches or your account.',
    ],
  },
];

const recovery: ManualSection = { id: 'recovery', icon: 'lock-reset', title: 'Recover my account', summary: 'Request a fresh recovery link.', path: 'Sign in > Forgot password', steps: ['Open Forgot password and enter your account email.', 'Use the newest recovery email and keep it private.', 'Choose a new password. If the link expired, request another one.'] };
const invitation: ManualSection = { id: 'join-team', icon: 'account-group-outline', title: 'Join my team', summary: 'Review an invitation before joining.', path: 'Captain or organiser invitation link', steps: ['Open the invitation link shared by your captain or organiser.', 'Sign in and check the team name and invited role.', 'Review and accept the invitation. If it expired or was revoked, ask the sender for a fresh link.'] };
const guides = [...sections, invitation, recovery];

export default function SportStageManualScreen() {
  const router = useRouter();
  const { task } = useLocalSearchParams<{ task?: string }>();
  const [query, setQuery] = useState('');
  const selected = guides.find(guide => guide.id === task);
  const visible = useMemo(() => guides.filter(guide => [guide.title, guide.summary, ...guide.steps].some(value => value.toLowerCase().includes(query.trim().toLowerCase()))), [query]);
  const open = (id: string) => router.push({ pathname: '/manual', params: { task: id } });
  if (selected) return <StagePage focused title={selected.id === 'scoring' ? 'Score a match' : selected.title} eyebrow="HELP" onBack={() => router.replace('/manual')} footer={['scoring', 'match'].includes(selected.id) ? <StageButton primary title="Start a match" onPress={() => router.push('/start-match')} /> : undefined}>
    <StageIntro eyebrow={selected.id === 'scoring' ? 'HOW TO SCORE' : 'NEXT STEPS'} title={selected.id === 'scoring' ? 'From setup to the first rally.' : selected.title} description={selected.summary} />
    <StageText variant="small" muted>{selected.path}</StageText>
    {selected.steps.map((step, index) => <View key={step} style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}><StageText variant="eyebrow" style={{ color: colors.accent, width: 22 }}>{index + 1}</StageText><StageText style={{ flex: 1 }}>{step}</StageText></View>)}
    {selected.note ? <StageNotice>{selected.note}</StageNotice> : null}
    {selected.id === 'scoring' ? <StageNotice>Cricket uses its own Numbers / Gestures scoring pad and ball-by-ball rules.</StageNotice> : null}
    {selected.id === 'recovery' ? <StageButton title="Open account security" onPress={() => router.push('/account')} /> : null}
    <StageButton title="Browse help topics" onPress={() => router.replace('/manual')} />
  </StagePage>;
  return <StagePage focused title="Help">
    <StageIntro eyebrow="A LITTLE GUIDANCE" title="What are you trying to do?" description="Choose a task to see the next steps." />
    <StageField label="Search help" value={query} onChangeText={setQuery} placeholder="Scoring, teams, competitions..." />
    {!query.trim() ? <StageList><StageRow title="Score a match" detail="Choose sport, setup, score" symbol="↗" onPress={() => open('scoring')} /><StageRow title="Join my team" detail="Invitations, rosters and eligibility" symbol="+" onPress={() => open('join-team')} /><StageRow title="Run a competition" detail="Entries, schedule and officials" symbol="◇" onPress={() => open('competition')} /><StageRow title="Recover my account" detail="Get a fresh password reset link" symbol="↻" onPress={() => open('recovery')} /></StageList> : null}
    <StageText variant="eyebrow" muted>{query.trim() ? 'SEARCH RESULTS' : 'MORE GUIDANCE'}</StageText>
    {visible.length ? <StageList>{visible.filter(guide => query.trim() || !['scoring','join-team','competition','recovery'].includes(guide.id)).map(guide => <StageRow key={guide.id} title={guide.title} detail={guide.summary} onPress={() => open(guide.id)} />)}</StageList> : <StageNotice>No guide found. Try scoring, teams or competitions.</StageNotice>}
  </StagePage>;
}
