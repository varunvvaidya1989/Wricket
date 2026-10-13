import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { useAuth } from '@/components/providers/AuthProvider';
import { StageIntro, StageNotice, StagePage, StageText, stageColors as colors } from '@/components/sports/platform/StageUI';
import { useSportMatches } from '@/hooks/useSportMatches';
import { analyzePlayer, rateLabel } from '@/lib/sports/analytics/analyze';
import { ANALYTICS_MODULES } from '@/lib/sports/analytics/modules';
import { SPORT_CONFIGS, type ScoringSportId } from '@/lib/sports/scoring';
import { CourtDiagram, FinishDiagram, MatchStory, RateDiagram, ServeFlow, TrendDiagram } from './AnalyticsDiagrams';

export function SportStatsScreen({ sportId }: { sportId: ScoringSportId }) {
  const auth = useAuth();
  const config = SPORT_CONFIGS[sportId];
  const module = ANALYTICS_MODULES[sportId];
  const { matches, loading, error, retry } = useSportMatches(sportId);
  const [selectedPlayer, setSelectedPlayer] = useState<string>();
  const [days, setDays] = useState('all');
  const [format, setFormat] = useState('all');
  const [competition, setCompetition] = useState('all');
  const [opponent, setOpponent] = useState('all');
  const [view, setView] = useState('overview');
  const players = useMemo(() => {
    const rows = new Map<string, { id: string; name: string; mine: boolean }>();
    matches.forEach(match => {
      ([0, 1] as const).forEach(side => {
        const ids = side === 0 ? match.sideAProfileIds : match.sideBProfileIds;
        const names = side === 0 ? match.sideAPlayers : match.sideBPlayers;
        const accounts = side === 0 ? match.sideAAccountIds : match.sideBAccountIds;
        ids.forEach((id, index) => rows.set(id, { id, name: names[index] ?? 'Player', mine: Boolean(accounts?.[index] && accounts[index] === auth.session?.user.id) }));
      });
    });
    return [...rows.values()].sort((a, b) => Number(b.mine) - Number(a.mine) || a.name.localeCompare(b.name));
  }, [matches, auth.session?.user.id]);
  const player = players.find(item => item.id === selectedPlayer) ?? players[0];
  const competitions = useMemo(() => [...new Map(matches.filter(match => match.competitionId).map(match => [match.competitionId!, match.competitionName])).entries()], [matches]);
  const availableOpponents = useMemo(() => {
    const ids = new Set<string>();
    matches.forEach(match => {
      if (match.sideAProfileIds.includes(player?.id ?? '')) match.sideBProfileIds.forEach(id => ids.add(id));
      if (match.sideBProfileIds.includes(player?.id ?? '')) match.sideAProfileIds.forEach(id => ids.add(id));
    });
    return players.filter(item => ids.has(item.id));
  }, [matches, player?.id, players]);
  const validCompetition = competition === 'all' || competitions.some(([id]) => id === competition) ? competition : 'all';
  const validOpponent = availableOpponents.some(item => item.id === opponent) ? opponent : 'all';
  const filtered = useMemo(() => matches.filter(match => {
    const date = Date.parse(match.updatedAt);
    if (days !== 'all' && (!Number.isFinite(date) || date < Date.now() - Number(days) * 86400000)) return false;
    if (format !== 'all' && (format === 'SINGLES' ? match.matchFormat !== 'SINGLES' : match.matchFormat === 'SINGLES')) return false;
    if (validCompetition !== 'all' && match.competitionId !== validCompetition) return false;
    const opponents = match.sideAProfileIds.includes(player?.id ?? '') ? match.sideBProfileIds : match.sideAProfileIds;
    return validOpponent === 'all' || opponents.includes(validOpponent);
  }), [matches, days, format, validCompetition, validOpponent, player?.id]);
  const stats = useMemo(() => analyzePlayer(sportId, filtered, player?.id ?? ''), [sportId, filtered, player?.id]);
  const coverage = stats.rallies.total ? Math.round(stats.detailSamples / stats.rallies.total * 100) : 0;

  return <StagePage>
    <StageIntro eyebrow="PERFORMANCE LAB" title="See the patterns. Shape your game." description={module.focus} />
    {loading ? <StageNotice>Loading your match history...</StageNotice> : null}
    {error ? <StageNotice retry={retry}>{error}</StageNotice> : null}
    {!loading && !error ? <>
      {!players.length ? <StageNotice>Record a match with linked players to begin. Enable Point details while scoring to unlock stroke and court analysis.</StageNotice> : <>
        <Picker label="PLAYER" value={player?.id ?? ''} items={players.map(item => ({ value: item.id, label: `${item.name}${item.mine ? ' (you)' : ''}` }))} onChange={setSelectedPlayer} />
        <Picker label="PERIOD" value={days} items={[{ value: 'all', label: 'All loaded matches' }, { value: '30', label: '30 days' }, { value: '90', label: '90 days' }]} onChange={setDays} />
        <Picker label="FORMAT" value={format} items={[{ value: 'all', label: 'All formats' }, { value: 'SINGLES', label: 'Singles' }, { value: 'DOUBLES', label: 'Doubles' }]} onChange={setFormat} />
        {competitions.length ? <Picker label="COMPETITION" value={validCompetition} items={[{ value: 'all', label: 'All competitions' }, ...competitions.map(([id, name]) => ({ value: id, label: name }))]} onChange={setCompetition} /> : null}
        {availableOpponents.length ? <Picker label="OPPONENT" value={validOpponent} items={[{ value: 'all', label: 'All opponents' }, ...availableOpponents.map(item => ({ value: item.id, label: item.name }))]} onChange={setOpponent} /> : null}
        <View style={styles.metrics}>{[
          { label: 'MATCHES', value: String(stats.matches) },
          { label: 'MATCH WIN RATE', value: rateLabel({ won: stats.wins, total: stats.completed }) },
          { label: 'RALLIES WON', value: rateLabel(stats.rallies) },
          { label: 'BEST RALLY RUN', value: String(stats.bestRun) },
        ].map(item => <View key={item.label} style={styles.metric}><StageText style={styles.value}>{item.value}</StageText><StageText variant="eyebrow" muted>{item.label}</StageText></View>)}</View>
        <StageText variant="small" muted>{stats.wins} wins from {stats.completed} verified completed matches. Latest 100 accessible participating or scored matches; filters use last match update.</StageText>
        <Picker label="EXPLORE" value={view} items={[{ value: 'overview', label: 'Overview' }, { value: 'tactics', label: 'Tactics' }, { value: 'matchups', label: 'Matchups' }]} onChange={setView} />
        {stats.matches ? <>
          {view === 'overview' ? <>
          <Panel title="Your momentum" description="Inspect how much of each match you controlled."><TrendDiagram trend={stats.trend} /></Panel>
          <Panel title="Watch the match unfold" description="Replay recorded rallies to find runs, responses and momentum swings. Undone points are removed."><MatchStory key={`${player?.id}:${days}:${format}:${validCompetition}:${validOpponent}`} trend={stats.trend} /></Panel>
          <Panel title={sportId === 'pickleball' ? 'Serve & side-out control' : 'Serve & return control'} description={sportId === 'pickleball' ? 'Receiving rally wins are side-outs under traditional scoring, and points under rally scoring.' : 'Rally outcomes while your side serves or receives.'}>
            <ServeFlow serve={stats.serve} returns={stats.returns} />
            <RateDiagram items={[{ label: 'Serve rallies won', rate: stats.serve }, { label: sportId === 'pickleball' ? 'Receiving rallies won' : 'Return rallies won', rate: stats.returns }]} />
          </Panel>
          </> : null}
          {view === 'tactics' ? <>
          <Panel title="When it matters" description="Pressure means either side can win the current game on the next rally, using this match’s rules.">
            <RateDiagram items={[{ label: 'Pressure rallies won', rate: stats.pressure }, ...((sportId === 'tennis' || sportId === 'padel') ? [{ label: 'Break points converted', rate: stats.breakPoints }] : [])]} />
          </Panel>
          <Panel title="Rally rhythm" description={`Short: 0–${module.shortRally} contacts. Long: ${module.longRally}+ contacts. Only observed lengths are included.`}>
            <RateDiagram items={[{ label: 'Short rallies won', rate: stats.shortRallies }, { label: 'Long rallies won', rate: stats.longRallies }]} />
            <StageText variant="small" muted>{stats.rallyLengthSamples ? `${(stats.rallyLengthTotal / stats.rallyLengthSamples).toFixed(1)} average contacts across ${stats.rallyLengthSamples} observed rallies.` : 'Add rally length in Point details to reveal this pattern.'}</StageText>
          </Panel>
          {(sportId === 'tennis' || sportId === 'padel') ? <Panel title="First & second serve" description="Rally win rates by the serve that started play. First-serve-in percentage needs all service attempts and is not inferred here."><RateDiagram items={[{ label: 'First-serve rallies won', rate: stats.firstServe }, { label: 'Second-serve rallies won', rate: stats.secondServe }]} /></Panel> : null}
          <Panel title="Where you finish" description={`Your ${config.name.toLowerCase()} court profile. Zone intensity shows your share of mapped winning finishes.`}><CourtDiagram zones={stats.zones} table={sportId === 'table_tennis'} /></Panel>
          <Panel title="Your finishing toolkit" description="Share of recorded winning finishes with a known final stroke. These are finishes, not shot conversion rates."><FinishDiagram items={stats.strokes} /></Panel>
          <Panel title={`${config.name} signature`} description="Individually attributed outcomes and winning finishes.">
            <View style={styles.metrics}>{stats.signature.map(item => <View style={styles.metric} key={item.label}><StageText style={styles.value}>{stats.individualSamples ? item.count : '—'}</StageText><StageText variant="small" muted>{item.label}</StageText></View>)}</View>
            <StageText variant="small" muted>{stats.winners} recorded winners · {stats.errors} recorded errors · {stats.individualSamples} attributed detailed outcomes.</StageText>
          </Panel>
          </> : null}
          {view === 'matchups' ? <>
          {stats.opponents.length ? <Panel title="Head to head" description="Verified completed results against each opponent or opposing pair."><RateDiagram items={stats.opponents.map(row => ({ label: row.name, rate: row.record }))} unit="matches" /></Panel> : null}
          {stats.partners.length ? <Panel title="Partnership chemistry" description="Verified completed doubles results with each linked partner."><RateDiagram items={stats.partners.map(row => ({ label: row.name, rate: row.record }))} unit="matches" /></Panel> : null}
          {!stats.opponents.length && !stats.partners.length ? <StageNotice>Finish a match with a verified point log to compare opponents and partnerships.</StageNotice> : null}
          </> : null}
          <Panel title="How much can you see?" description="Data coverage keeps a sparse record from looking like a complete tactical profile.">
            <RateDiagram items={[{ label: 'Detailed outcomes recorded', rate: { won: stats.detailSamples, total: stats.rallies.total } }, { label: 'Rally lengths recorded', rate: { won: stats.rallyLengthSamples, total: stats.rallies.total } }]} unit="observations" />
            <StageText variant="small" muted>{coverage < 50 ? 'Enable Point details for more rallies to build a richer tactical profile.' : 'Keep recording consistent observations to compare patterns over time.'} {stats.doubles ? `${stats.doubles} doubles matches: serve, return and rally rates describe your pair. Shot figures require explicit player attribution.` : 'Singles outcomes are attributed to the linked player.'}</StageText>
          </Panel>
        </> : <StageNotice>No matches for these filters. Try a broader period, format or competition.</StageNotice>}
        {stats.excluded ? <StageNotice>{stats.excluded} match logs could not be replayed and were excluded from all metrics.</StageNotice> : null}
      </>}
    </> : null}
  </StagePage>;
}

function Picker({ label, value, items, onChange }: { label: string; value: string; items: { label: string; value: string }[]; onChange: (value: string) => void }) {
  return <View style={{ gap: 8 }}><StageText variant="eyebrow" muted>{label}</StageText><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>{items.map(item => <Pressable key={item.value} accessibilityRole="button" accessibilityLabel={`${label}: ${item.label}`} accessibilityState={{ selected: value === item.value }} onPress={() => onChange(item.value)} style={[styles.chip, value === item.value && { borderColor: colors.accent }]}><StageText variant="small" style={value === item.value ? { color: colors.accent } : undefined}>{item.label}</StageText></Pressable>)}</ScrollView></View>;
}
function Panel({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <View style={styles.panel}><StageText variant="heading" accessibilityRole="header">{title}</StageText><StageText variant="small" muted>{description}</StageText>{children}</View>;
}
const styles = StyleSheet.create({
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metric: { width: '47%', flexGrow: 1, minWidth: 0, padding: 16, gap: 8, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 16 },
  value: { fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 29, lineHeight: 34, color: colors.accent },
  panel: { padding: 18, gap: 16, borderWidth: 1, borderColor: colors.border, borderRadius: 18, backgroundColor: colors.surface },
  chip: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 22, backgroundColor: colors.surface },
});
