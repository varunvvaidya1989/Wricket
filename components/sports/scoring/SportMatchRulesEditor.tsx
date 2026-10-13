import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { StageText } from '@/components/sports/platform/StageUI';
import {
  normalizeSportRules,
  sportRuleProfile,
  sportRulesSummary,
  type MatchOptions,
  type ScoringSportId,
} from '@/lib/sports/scoring';
import { colors } from '@/lib/wricket/presentation/design';
import { radius, spacing } from '@/lib/theme/spacing';

interface Props {
  sportId: ScoringSportId;
  value: MatchOptions;
  onChange: (value: MatchOptions) => void;
  accent: string;
}

export function SportMatchRulesEditor({ sportId, value, onChange, accent }: Props) {
  const options = normalizeSportRules(sportId, value);
  const profile = sportRuleProfile(sportId);
  const set = (patch: Record<string, boolean | number>) => onChange(normalizeSportRules(sportId, { ...options, ...patch }));

  return <View style={styles.container}>
    <View style={styles.heading}>
      <View style={styles.flex}><StageText variant="eyebrow" muted>MATCH RULES</StageText><StageText variant="rowTitle">Sport-approved format</StageText></View>
      
    </View>

    <RuleGroup label={`NUMBER OF ${profile.unitName.toUpperCase()}`} detail="The match ends when one side wins the required majority.">
      <View style={styles.choices}>{profile.unitsToWin.map((count) => <Choice key={count} label={`Best of ${count * 2 - 1}`} selected={options.matchUnitsToWin === count} accent={accent} onPress={() => set({ matchUnitsToWin: count })} />)}</View>
    </RuleGroup>

    {profile.tiedScoreRule === 'ADVANTAGE_OPTIONAL' ? <RuleGroup label="AFTER DEUCE" detail="Choose whether two clear points are required to win the game.">
      <View style={styles.choices}>
        <Choice label="Advantage" selected={sportId === 'tennis' ? !options.noAd : !options.goldenPoint} accent={accent} onPress={() => set(sportId === 'tennis' ? { noAd: false } : { goldenPoint: false })} />
        <Choice label={sportId === 'padel' ? 'Golden point' : 'Deciding point'} selected={sportId === 'tennis' ? options.noAd === true : options.goldenPoint === true} accent={accent} onPress={() => set(sportId === 'tennis' ? { noAd: true } : { goldenPoint: true })} />
      </View>
    </RuleGroup> : <RuleGroup label="TIED-SCORE RULE" detail={profile.tiedScoreRule === 'BADMINTON_CAP' ? 'At 20-20, play continues until a two-point lead; at 29-29, the next point wins.' : 'Play continues until one side leads by two points.'}><LockedRule label={profile.tiedScoreRule === 'BADMINTON_CAP' ? 'Win by 2 · cap at 30' : 'Win by 2'} /></RuleGroup>}

    {profile.setTiebreak ? <RuleGroup label="SET TIE-BREAK" detail="Applied when a set reaches six games all.">
      <View style={styles.choices}>
        <Choice label="Tie-break to 7" selected={options.setTiebreak !== false} accent={accent} onPress={() => set({ setTiebreak: true, setCap: 7, tieBreakPoints: 7 })} />
        <Choice label="Advantage set" selected={options.setTiebreak === false} accent={accent} onPress={() => set({ setTiebreak: false, setCap: 0 })} />
      </View>
    </RuleGroup> : null}

    {profile.pointTargets ? <RuleGroup label="POINTS PER GAME" detail="Games to 15 or 21 are single-game match formats under the official tournament rules.">
      <View style={styles.choices}>{profile.pointTargets.map((target) => <Choice key={target} label={`${target} points`} selected={options.gamePointTarget === target} accent={accent} onPress={() => set({ gamePointTarget: target, ...(target === 11 ? {} : { matchUnitsToWin: 1 }) })} />)}</View>
    </RuleGroup> : null}

    {sportId === 'pickleball' ? <RuleGroup label="SCORING METHOD" detail="Side-out is the standard format; rally scoring awards every rally.">
      <View style={styles.choices}>
        <Choice label="Side-out" selected={options.rallyScoring !== true} accent={accent} onPress={() => set({ rallyScoring: false })} />
        <Choice label="Rally scoring" selected={options.rallyScoring === true} accent={accent} onPress={() => set({ rallyScoring: true })} />
      </View>
    </RuleGroup> : null}

    <View style={[styles.summary, { borderColor: accent }]}><StageText variant="small" style={{ color: accent }}>{sportRulesSummary(sportId, options)}</StageText></View>
  </View>;
}

function RuleGroup({ label, detail, children }: { label: string; detail: string; children: React.ReactNode }) {
  return <View style={styles.group}><StageText variant="eyebrow" muted>{label}</StageText><StageText variant="small" muted>{detail}</StageText>{children}</View>;
}

function Choice({ label, selected, accent, onPress }: { label: string; selected: boolean; accent: string; onPress: () => void }) {
  return <Pressable accessibilityRole="radio" aria-checked={selected} accessibilityState={{ checked: selected }} onPress={onPress} style={[styles.choice, selected && { borderColor: accent, backgroundColor: `${accent}16` }]}><StageText variant="small" style={selected ? { color: accent } : undefined}>{label}</StageText></Pressable>;
}

function LockedRule({ label }: { label: string }) {
  return <View style={styles.locked}><StageText variant="small">{label}</StageText><StageText variant="eyebrow" muted>SPORT RULE</StageText></View>;
}

const styles = StyleSheet.create({
  container: { padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface, gap: spacing.md },
  heading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  group: { gap: spacing.sm },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  choice: { minHeight: 44, minWidth: 100, flexGrow: 1, paddingHorizontal: spacing.sm, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  locked: { minHeight: 44, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surfaceElevated, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  summary: { padding: spacing.sm, borderLeftWidth: 3, borderRadius: radius.sm, backgroundColor: colors.surfaceElevated },
  flex: { flex: 1, minWidth: 0 },
});
