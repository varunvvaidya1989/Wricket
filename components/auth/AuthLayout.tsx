import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';
import Head from 'expo-router/head';
import React from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StageText, stageColors as colors } from '@/components/sports/platform/StageUI';

export function AuthLayout({ title, description, children, onBack }: {
  title: string; description: string; children: React.ReactNode; onBack?: () => void;
}) {
  const router = useRouter();
  return <SafeAreaView style={styles.page}>
    <Head><title>{title} | SportStage</title>{Platform.OS === 'web' ? <style>{`
      #sportstage-auth-form input { color-scheme: dark; }
      #sportstage-auth-form input:-webkit-autofill,
      #sportstage-auth-form input:-webkit-autofill:hover,
      #sportstage-auth-form input:-webkit-autofill:focus {
        -webkit-box-shadow: 0 0 0 1000px #111b16 inset;
        -webkit-text-fill-color: #e8eee7;
        caret-color: #e8eee7;
      }
    `}</style> : null}</Head>
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
        <View style={styles.column}>
          <View style={styles.header}>
            <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onBack ?? (() => router.canGoBack() ? router.back() : router.replace('/live'))} style={styles.back}>
              <MaterialCommunityIcons name="arrow-left" size={22} color={colors.text} />
            </Pressable>
            <View style={styles.brand}>
              <Image accessible={false} source={require('@/assets/sportstage/logo/sportstage-mark-rounded-512.png')} style={{ width: 29, height: 29 }} />
              <StageText variant="heading" style={{ fontSize: 19, letterSpacing: -0.4 }}>SportStage</StageText>
            </View>
            <View style={{ width: 44 }} />
          </View>
          <View style={styles.intro}>
            <StageText variant="title" style={{ fontSize: 34, lineHeight: 40 }}>{title}</StageText>
            <StageText muted style={{ fontSize: 14, lineHeight: 22 }}>{description}</StageText>
          </View>
          <View nativeID="sportstage-auth-form" style={styles.form}>{children}</View>
          <View style={styles.footer}>
            <AuthLink title="Explore live scores" onPress={() => router.replace('/live')} muted />
            <View style={styles.dot} />
            <AuthLink title="Privacy & support" onPress={() => router.push('/support')} muted />
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

export function AuthLink({ title, onPress, disabled, muted = false }: { title: string; onPress: () => void; disabled?: boolean; muted?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled: Boolean(disabled) }} disabled={disabled} onPress={onPress} style={({ pressed }) => ({ minHeight: 44, paddingVertical: 10, paddingHorizontal: 3, justifyContent: 'center', opacity: disabled || pressed ? 0.55 : 1 })}>
    <StageText style={{ color: muted ? colors.textMuted : colors.accent, fontSize: muted ? 12 : 13, fontFamily: 'Inter_500Medium', textAlign: 'center' }}>{title}</StageText>
  </Pressable>;
}

export function AuthMethods({ phone = false, onEmail, onPhone, disabled }: { phone?: boolean; onEmail: () => void; onPhone: () => void; disabled?: boolean }) {
  return <View style={styles.methods}>{([
    { label: 'Email', icon: 'email-outline', selected: !phone, action: onEmail, accessibility: 'Use email instead' },
    { label: 'Phone', icon: 'cellphone', selected: phone, action: onPhone, accessibility: 'Use phone SMS code' },
  ] as const).map(method => <Pressable key={method.label} accessibilityRole="button" accessibilityLabel={method.accessibility} accessibilityState={{ selected: method.selected, disabled: Boolean(disabled) }} aria-pressed={method.selected} disabled={disabled} onPress={method.action} style={[styles.method, method.selected && styles.selected]}>
    <MaterialCommunityIcons name={method.icon} size={18} color={method.selected ? colors.text : colors.textMuted} />
    <StageText style={{ color: method.selected ? colors.text : colors.textMuted, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>{method.label}</StageText>
  </Pressable>)}</View>;
}

export const authInputStyle = { minHeight: 54, fontSize: 16, borderRadius: 12, backgroundColor: '#111b16', borderColor: '#34483b', paddingHorizontal: 15 } as const;

export function AuthPrimaryButton({ title, onPress, loading, disabled, accessibilityLabel }: { title: string; onPress: () => void; loading?: boolean; disabled?: boolean; accessibilityLabel?: string }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? title} accessibilityState={{ disabled: Boolean(disabled || loading), busy: Boolean(loading) }} disabled={disabled || loading} onPress={onPress} style={({ pressed }) => ({ minHeight: 54, paddingHorizontal: 20, paddingVertical: 14, borderRadius: 12, backgroundColor: colors.accent, opacity: pressed || disabled || loading ? 0.6 : 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 })}>
    <StageText style={{ color: colors.bg, fontFamily: 'Inter_600SemiBold', fontSize: 15 }}>{loading ? 'Please wait…' : title}</StageText>
    {!loading ? <MaterialCommunityIcons name="arrow-right" size={18} color={colors.bg} /> : null}
  </Pressable>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  scroll: { flexGrow: 1, paddingHorizontal: 22, paddingVertical: 12, justifyContent: 'center' },
  column: { width: '100%', maxWidth: 440, alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 36 },
  back: { width: 44, height: 44, justifyContent: 'center', alignItems: 'flex-start' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  intro: { gap: 10, marginBottom: 26 },
  form: { gap: 20 },
  methods: { flexDirection: 'row', padding: 4, borderRadius: 14, backgroundColor: '#131c17', borderWidth: 1, borderColor: colors.border, gap: 4 },
  method: { flex: 1, minHeight: 44, borderRadius: 10, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
  selected: { backgroundColor: '#29392d', borderWidth: 1, borderColor: '#42583e' },
  footer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', columnGap: 10, marginTop: 28 },
  dot: { width: 3, height: 3, borderRadius: 2, backgroundColor: colors.textMuted },
});
