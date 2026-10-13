import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';
import Head from 'expo-router/head';
import React, { useId, useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps, type TextProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, fonts } from '@/lib/wricket/presentation/design';
import { SportIcon } from '@/components/sports/SportIcon';
import { sportCardPhotos } from '@/lib/sports/platform/sportCardArt';
export { colors as stageColors };

export function StageText({ variant = 'body', muted = false, style, ...props }: TextProps & { variant?: 'body' | 'title' | 'eyebrow' | 'heading' | 'rowTitle' | 'small'; muted?: boolean }) {
  return <Text role={variant === 'title' ? 'heading' : undefined} aria-level={variant === 'title' ? 1 : undefined} {...props} style={[styles.text, styles[variant], muted && { color: colors.textMuted }, style]} />;
}

export function StagePage({ children, focused = false, title, eyebrow = 'SPORTSTAGE', footer, onBack }: { children: React.ReactNode; focused?: boolean; title?: string; eyebrow?: string; footer?: React.ReactNode; onBack?: () => void }) {
  const router = useRouter();
  return <SafeAreaView edges={focused ? ['top', 'left', 'right', 'bottom'] : ['left', 'right', 'bottom']} style={styles.page}>
    {title ? <Head><title>{title} | SportStage</title></Head> : null}
    {focused ? <View style={styles.taskHeader}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onBack ?? (() => router.canGoBack() ? router.back() : router.replace('/live'))} style={styles.iconButton}>
        <MaterialCommunityIcons name="chevron-left" size={24} color={colors.text} />
      </Pressable>
      <View style={styles.copy}><StageText variant="eyebrow" muted style={{ fontSize: 9, lineHeight: 13.5 }}>{eyebrow}</StageText><StageText variant="heading" style={{ fontSize: 15, lineHeight: 18.75 }}>{title}</StageText></View>
    </View> : null}
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
      {children}
    </ScrollView>{footer ? <View style={styles.footer}>{footer}</View> : null}</KeyboardAvoidingView>
  </SafeAreaView>;
}

export function StageIntro({ eyebrow, title, description }: { eyebrow?: string; title: string; description: string }) {
  return <View style={{ gap: 10 }}>{eyebrow ? <StageText variant="eyebrow" muted>{eyebrow}</StageText> : null}
    <Head><title>{title} | SportStage</title></Head>
    <StageText variant="title" role="heading" aria-level={1}>{title}</StageText><StageText muted>{description}</StageText></View>;
}

export function StageButton({ title, onPress, primary = false, danger = false, disabled = false, loading = false, accessibilityLabel }: { title: string; onPress: () => void; primary?: boolean; danger?: boolean; disabled?: boolean; loading?: boolean; accessibilityLabel?: string }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? title} accessibilityState={{ disabled: disabled || loading, busy: loading }} disabled={disabled || loading} onPress={onPress} style={({ pressed }) => [styles.button, primary && { backgroundColor: colors.accent, borderColor: colors.accent }, danger && { backgroundColor: colors.danger, borderColor: colors.danger }, (disabled || loading || pressed) && styles.pressed]}><StageText style={[styles.buttonText, (primary || danger) && { color: colors.bg }]}>{loading ? 'Please wait…' : title}</StageText></Pressable>;
}

export function StageField({ label, error, style, ...props }: TextInputProps & { label: string; error?: string }) {
  const errorId = useId();
  const errorProps = Platform.OS === 'web' ? { 'aria-invalid': Boolean(error), 'aria-describedby': error ? errorId : undefined } : {};
  return <View style={{ gap: 8 }}><StageText>{label}</StageText><TextInput {...props} {...errorProps} accessibilityLabel={props.accessibilityLabel ?? label} placeholderTextColor="#7f927e" style={[styles.input, error && { borderColor: colors.danger }, style]} />{error ? <StageText nativeID={errorId} variant="small" accessibilityLiveRegion="polite" style={{ color: colors.danger }}>{error}</StageText> : null}</View>;
}

export function StageStateArt({ symbol }: { symbol: string }) {
  return <View style={{ alignSelf: 'center', width: 108, height: 108, marginVertical: 18, borderRadius: 30, backgroundColor: '#263b25', borderWidth: 1, borderColor: '#42563a', justifyContent: 'center', alignItems: 'center' }}><StageText style={{ fontSize: 44, lineHeight: 56, color: colors.accent }}>{symbol}</StageText></View>;
}

export function StageNotice({ children, retry, danger = false }: { children: React.ReactNode; retry?: () => void; danger?: boolean }) {
  return <View style={[styles.notice, danger && { borderColor: colors.danger, backgroundColor: '#281c19' }]}><StageText variant="small" accessibilityLiveRegion="polite">{children}</StageText>{retry ? <StageButton title="Try again" onPress={retry} /> : null}</View>;
}

export function StageList({ children }: { children: React.ReactNode }) {
  return <View style={styles.list}>{children}</View>;
}

export function StageLiveCard({ sport, competition, participantA, participantB, score, status, onPress }: { sport: string; competition: string; participantA: string; participantB: string; score: string; status: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.matchCard, pressed && styles.pressed]}>
    <StageText variant="small" muted>{sport.toUpperCase()} · {status.toUpperCase()}</StageText>
    <View style={styles.matchSides}><View style={[styles.copy, { gap: 7 }]}><StageText variant="rowTitle">{participantA}</StageText><StageText variant="rowTitle">{participantB}</StageText></View>
      <StageText style={styles.matchScore}>{score}</StageText></View>
    <StageText variant="small" muted>{competition}</StageText>
  </Pressable>;
}

export function StageRow({ title, detail, symbol, onPress }: { title: string; detail?: string; symbol?: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`${title}${detail ? `, ${detail}` : ''}`} onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
    {symbol ? <View style={styles.tileIcon}><StageText style={styles.letter}>{symbol}</StageText></View> : null}
    <View style={styles.copy}><StageText variant="rowTitle">{title}</StageText>{detail ? <StageText variant="small" muted>{detail}</StageText> : null}</View>
    <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textMuted} />
  </Pressable>;
}

export function StageSportGrid({ sports, current, setup = false, onChoose }: { sports: readonly { code: string; name: string }[]; current?: string; setup?: boolean; onChoose: (code: string) => void }) {
  const [gridWidth, setGridWidth] = useState(0);
  return <View style={styles.grid} onLayout={event => setGridWidth(event.nativeEvent.layout.width)}>{sports.map(sport => <Pressable key={sport.code} accessibilityRole="button" accessibilityLabel={`${setup ? 'Set up' : 'Open'} ${sport.name}`} accessibilityState={{ selected: current === sport.code }} onPress={() => onChoose(sport.code)} style={({ pressed }) => [styles.tile, gridWidth > 0 && { width: (gridWidth - 10) / 2 }, current === sport.code && styles.current, pressed && styles.pressed]}>
    <View style={styles.tilePhoto} pointerEvents="none">
      {sportCardPhotos[sport.code] ? <Image accessible={false} source={sportCardPhotos[sport.code]} resizeMode="contain" style={styles.tileImage} /> : null}
      <View style={[styles.tileIcon, styles.photoIcon]}><SportIcon code={sport.code} color={colors.accent} size={23} /></View>
    </View>
    <View style={styles.tileCaption}><StageText style={styles.tileTitle}>{sport.name}</StageText><StageText variant="eyebrow" style={{ letterSpacing: 0, color: '#e1ebdd' }}>{setup ? 'SET UP A MATCH →' : sport.code === 'CRICKET' ? 'WRICKET →' : 'OPEN SPORT →'}</StageText></View>
  </Pressable>)}</View>;
}

const styles = StyleSheet.create({
  text: { color: colors.text, fontFamily: fonts.body },
  body: { fontSize: 12, lineHeight: 19.8 },
  title: { fontFamily: fonts.display, fontSize: 29, lineHeight: 33.35, letterSpacing: -0.8 },
  heading: { fontFamily: fonts.display, fontSize: 17, lineHeight: 22.1 },
  eyebrow: { fontFamily: fonts.mono, fontSize: 10, lineHeight: 15, letterSpacing: 1 },
  rowTitle: { fontFamily: fonts.display, fontSize: 14, lineHeight: 19.6 },
  small: { fontSize: 11, lineHeight: 17.05 },
  page: { flex: 1, backgroundColor: colors.bg },
  content: { width: '100%', maxWidth: 760, alignSelf: 'center', flexGrow: 1, padding: 18, paddingBottom: 30, gap: 18 },
  footer: { width: '100%', maxWidth: 760, alignSelf: 'center', paddingVertical: 12, paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: colors.border },
  input: { minHeight: 48, borderRadius: 10, borderWidth: 1, borderColor: '#41543b', backgroundColor: '#111b13', color: colors.text, paddingHorizontal: 12, fontSize: 13, fontFamily: fonts.body },
  taskHeader: { width: '100%', maxWidth: 760, alignSelf: 'center', paddingVertical: 12, paddingHorizontal: 16, gap: 12, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: colors.border },
  iconButton: { width: 44, minHeight: 44, borderWidth: 1, borderColor: colors.border, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, minWidth: 0, gap: 3 },
  button: { minHeight: 46, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.borderStrong, justifyContent: 'center', backgroundColor: colors.surface },
  buttonText: { color: colors.text, textAlign: 'center', fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 13 },
  notice: { padding: 13, gap: 10, borderWidth: 1, borderColor: '#42563a', backgroundColor: '#1e2d1b', borderRadius: 11 },
  list: { borderWidth: 1, borderColor: colors.border, borderRadius: 16, overflow: 'hidden', backgroundColor: colors.surface },
  matchCard: { borderWidth: 1, borderColor: colors.border, borderRadius: 16, backgroundColor: colors.surface, padding: 16, gap: 12 },
  matchSides: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  matchScore: { color: colors.accent, fontFamily: fonts.mono, fontSize: 13, maxWidth: '45%' },
  row: { minHeight: 76, padding: 16, gap: 11, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { width: '48%', minHeight: 176, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: 15, overflow: 'hidden' },
  tilePhoto: { width: '100%', aspectRatio: 640 / 420, backgroundColor: '#263b25' },
  tileImage: { width: '100%', height: '100%' },
  tileCaption: { flex: 1, padding: 12, gap: 6, backgroundColor: colors.surface },
  photoIcon: { position: 'absolute', top: 9, left: 9, backgroundColor: '#162417' },
  current: { borderColor: '#779b58', backgroundColor: '#22321e' },
  tileTitle: { fontFamily: fonts.display, fontSize: 15, lineHeight: 21 },
  tileIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#263b25', borderWidth: 1, borderColor: '#42563a', alignItems: 'center', justifyContent: 'center' },
  letter: { fontFamily: fonts.mono, fontSize: 14, color: colors.accent },
  pressed: { opacity: 0.75 },
});
