import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { AppHeader } from '@/components/ui/AppHeader';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';

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
    summary: 'Choose opponents, time, court, match order, officials, and lineups.', path: 'Competition → Schedule',
    steps: [
      'Tap Add fixture and choose two approved entrants from the same division.',
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
      'Classify the point in the dialog—for example ace, service winner, forced error, unforced error, or double fault.',
      'SportStage applies the selected sport’s game, set, advantage, deuce, and tie-break rules automatically.',
      'Use Undo only for the most recent incorrect action. The live score and timeline update for viewers.',
      'Complete the match after the winning condition is reached and verify the result.',
    ],
    note: 'For example, a double fault is recorded against the server while the point is awarded to the receiver.',
  },
  {
    id: 'watch', icon: 'access-point', title: 'Watch live and upcoming sport',
    summary: 'Find public matches, open the live timeline, and follow competitions.', path: 'SportStage → Live network, or a sport → Live',
    steps: [
      'Open Live network to see public live matches across every sport.',
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
    summary: 'What to check when a player, competition, or live score is missing.', path: 'Competition → Manage, or Account settings',
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

const quickStarts = [
  { label: 'PLAY A MATCH', id: 'match', icon: 'racquetball' as const },
  { label: 'RUN A COMPETITION', id: 'competition', icon: 'trophy-outline' as const },
  { label: 'SCORE LIVE', id: 'scoring', icon: 'scoreboard-outline' as const },
  { label: 'WATCH SPORT', id: 'watch', icon: 'access-point' as const },
];

export default function SportStageManualScreen() {
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(['account']));
  const visibleSections = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return sections;
    return sections.filter((section) => [section.title, section.summary, section.path, section.note, ...section.steps].some((value) => value?.toLowerCase().includes(needle)));
  }, [query]);

  const open = (id: string) => {
    const section = sections.find((item) => item.id === id);
    setQuery(section?.title ?? '');
    setExpanded((current) => new Set(current).add(id));
  };
  const toggle = (id: string) => setExpanded((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return <Screen scroll padded={false}>
    <AppHeader title="How to use SportStage" eyebrow="PLAYER & ORGANIZER MANUAL" back />
    <View style={styles.content}>
      <View style={styles.hero}>
        <MaterialCommunityIcons name="book-open-page-variant-outline" size={34} color={colors.accent} />
        <Text variant="h2" style={styles.heroTitle}>What would you like to do?</Text>
        <Text variant="body" tone="muted" style={styles.bodyCopy}>Follow a task from start to finish. The same workflow applies to cricket, tennis, badminton, padel, table tennis, and pickleball; scoring rules adapt to the selected sport.</Text>
        <View style={styles.quickGrid}>{quickStarts.map((item) => <Pressable key={item.id} onPress={() => open(item.id)} style={styles.quickAction}><MaterialCommunityIcons name={item.icon} size={20} color={colors.accent} /><Text variant="overline" style={styles.quickLabel}>{item.label}</Text></Pressable>)}</View>
      </View>

      <View style={styles.searchBox}><MaterialCommunityIcons name="magnify" size={21} color={colors.textMuted} /><TextInput value={query} onChangeText={setQuery} placeholder="Search the manual" placeholderTextColor={colors.textDim} style={styles.searchInput} /></View>
      <Text variant="overline" tone="dim">GUIDES · {visibleSections.length}</Text>
      {visibleSections.map((section) => {
        const isOpen = expanded.has(section.id) || Boolean(query.trim());
        return <View key={section.id} style={styles.guideCard}>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: isOpen }} onPress={() => toggle(section.id)} style={styles.guideHeader}>
            <View style={styles.iconBubble}><MaterialCommunityIcons name={section.icon} size={22} color={colors.accent} /></View>
            <View style={styles.flex}><Text variant="h3" style={styles.guideTitle}>{section.title}</Text><Text variant="caption" tone="muted" style={styles.smallCopy}>{section.summary}</Text></View>
            <MaterialCommunityIcons name={isOpen ? 'chevron-up' : 'chevron-down'} size={22} color={colors.textMuted} />
          </Pressable>
          {isOpen ? <View style={styles.guideBody}>
            <View style={styles.path}><MaterialCommunityIcons name="map-marker-path" size={18} color={colors.accent} /><View style={styles.flex}><Text variant="overline" tone="dim">WHERE TO FIND IT</Text><Text variant="caption">{section.path}</Text></View></View>
            {section.steps.map((step, index) => <View key={step} style={styles.step}><View style={styles.stepNumber}><Text variant="overline" style={styles.stepNumberText}>{index + 1}</Text></View><Text variant="body" style={[styles.flex, styles.bodyCopy]}>{step}</Text></View>)}
            {section.note ? <View style={styles.note}><MaterialCommunityIcons name="lightbulb-outline" size={18} color={colors.gold} /><Text variant="caption" style={styles.flex}>{section.note}</Text></View> : null}
          </View> : null}
        </View>;
      })}
      {!visibleSections.length ? <View style={styles.empty}><MaterialCommunityIcons name="text-search" size={30} color={colors.textDim} /><Text variant="h3">No guide found</Text><Text variant="caption" tone="muted">Try a task such as scoring, teams, check-in, live, or tournament.</Text></View> : null}
      <View style={styles.glossary}><Text variant="h3" style={styles.guideTitle}>Competition status guide</Text><Status label="Draft" copy="Only organizers can work on it." /><Status label="Registration open" copy="Eligible players or teams can enter." /><Status label="Published" copy="Public information and schedule are visible." /><Status label="Live" copy="At least one competition match is in progress." /><Status label="Completed" copy="Results and statistics remain available." /></View>
    </View>
  </Screen>;
}

function Status({ label, copy }: { label: string; copy: string }) {
  return <View style={styles.statusRow}><Text variant="bodyStrong" style={styles.statusLabel}>{label}</Text><Text variant="caption" tone="muted" style={[styles.flex, styles.smallCopy]}>{copy}</Text></View>;
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.md },
  hero: { padding: spacing.lg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.xl, backgroundColor: colors.surface, gap: spacing.sm },
  heroTitle: { fontSize: 20, lineHeight: 25 }, guideTitle: { fontSize: 16, lineHeight: 21 }, bodyCopy: { fontSize: 13, lineHeight: 19 }, smallCopy: { fontSize: 11, lineHeight: 16 },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  quickAction: { width: '48%', minHeight: 72, padding: spacing.sm, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, justifyContent: 'center', gap: spacing.xs, backgroundColor: colors.bg },
  quickLabel: { color: colors.text, fontSize: 9 },
  searchBox: { minHeight: 50, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  searchInput: { flex: 1, minHeight: 48, color: colors.text, fontSize: 14 },
  guideCard: { overflow: 'hidden', borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface },
  guideHeader: { minHeight: 82, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  guideBody: { paddingHorizontal: spacing.md, paddingBottom: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, gap: spacing.md },
  iconBubble: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentMuted },
  path: { marginTop: spacing.md, padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.bg, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  stepNumber: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent },
  stepNumberText: { color: colors.accentInk },
  note: { padding: spacing.sm, borderLeftWidth: 2, borderLeftColor: colors.gold, backgroundColor: colors.bg, flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  glossary: { marginTop: spacing.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, gap: spacing.sm },
  statusRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }, statusLabel: { width: 104, fontSize: 13 },
  empty: { padding: spacing.xl, alignItems: 'center', gap: spacing.sm }, flex: { flex: 1, minWidth: 0 },
});
