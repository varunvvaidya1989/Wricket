import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { Href } from 'expo-router';
import { useRouter } from 'expo-router';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Image,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AdPrivacyOptions } from '@/components/ads/AdPrivacyOptions';
import { SportStageSignOutActions } from '@/components/auth/SportStageSignOutActions';
import { useAuth } from '@/components/providers/AuthProvider';
import { Text } from '@/components/ui/Text';
import { SPORT_CONFIGS, SPORT_PRESENTATION, type ScoringSportId } from '@/lib/sports/scoring';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';

interface SportProfileDrawerContextValue {
  readonly sportId?: ScoringSportId;
  openProfileDrawer(): void;
}

const SportProfileDrawerContext = createContext<SportProfileDrawerContextValue | null>(null);

export function SportProfileDrawerProvider({
  sportId,
  children,
}: {
  sportId?: ScoringSportId;
  children: React.ReactNode;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <SportProfileDrawerContext.Provider value={{ sportId, openProfileDrawer: () => setVisible(true) }}>
      {children}
      <SportProfileDrawer sportId={sportId} visible={visible} onClose={() => setVisible(false)} />
    </SportProfileDrawerContext.Provider>
  );
}

export function SportAvatarButton({
  compact = false,
  initialsOnly = false,
}: {
  compact?: boolean;
  initialsOnly?: boolean;
}) {
  const context = useContext(SportProfileDrawerContext);
  const auth = useAuth();
  if (!context) throw new Error('SportAvatarButton must be used within SportProfileDrawerProvider.');
  const presentation = context.sportId ? SPORT_PRESENTATION[context.sportId] : undefined;
  const accent = presentation?.accent ?? colors.accent;
  const name = auth.profile?.displayName ?? auth.session?.user.email ?? 'Player';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={context.sportId ? `Open ${SPORT_CONFIGS[context.sportId].name} profile` : 'Open profile'}
      onPress={context.openProfileDrawer}
      style={({ pressed }) => [
        styles.avatarButton,
        compact && styles.avatarButtonCompact,
        { borderColor: accent, backgroundColor: `${accent}18` },
        pressed && styles.pressed,
      ]}
    >
      {auth.profile?.avatarUrl && !initialsOnly
        ? <Image source={{ uri: auth.profile.avatarUrl }} style={styles.avatarImage} />
        : <Text variant="bodyStrong" style={{ color: accent }}>{initials(name)}</Text>}
    </Pressable>
  );
}

function SportProfileDrawer({
  sportId,
  visible,
  onClose,
}: {
  sportId?: ScoringSportId;
  visible: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const auth = useAuth();
  const config = sportId ? SPORT_CONFIGS[sportId] : undefined;
  const presentation = sportId ? SPORT_PRESENTATION[sportId] : undefined;
  const accent = presentation?.accent ?? colors.accent;
  const { width } = useWindowDimensions();
  const drawerWidth = Math.min(width * 0.88, 380);
  const translateX = useRef(new Animated.Value(drawerWidth)).current;
  const name = auth.profile?.displayName ?? auth.session?.user.email?.split('@')[0] ?? 'SportStage player';

  useEffect(() => {
    if (!visible) return;
    translateX.setValue(drawerWidth);
    Animated.timing(translateX, { toValue: 0, duration: 220, useNativeDriver: true }).start();
  }, [drawerWidth, translateX, visible]);

  const navigate = useCallback((href: Href, replace = false) => {
    onClose();
    requestAnimationFrame(() => replace ? router.replace(href) : router.push(href));
  }, [onClose, router]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close profile" onPress={onClose} style={styles.backdrop} />
        <Animated.View style={[styles.drawer, { width: drawerWidth, transform: [{ translateX }] }]}>
          <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
            <View style={styles.drawerHeader}>
              <Text variant="overline" tone="muted">{config ? `${config.name.toUpperCase()} PROFILE` : 'SPORTSTAGE PROFILE'}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Close profile" onPress={onClose} style={styles.closeButton}>
                <MaterialCommunityIcons name="close" size={22} color={colors.text} />
              </Pressable>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.drawerContent}>
              <Pressable onPress={() => navigate('/profile')} style={({ pressed }) => [styles.profileCard, pressed && styles.pressed]}>
                <View style={[styles.largeAvatar, { backgroundColor: `${accent}18` }]}>
                  {auth.profile?.avatarUrl
                    ? <Image source={{ uri: auth.profile.avatarUrl }} style={styles.avatarImage} />
                    : <Text variant="h2" style={{ color: accent }}>{initials(name)}</Text>}
                </View>
                <View style={styles.profileCopy}>
                  <Text variant="h3" numberOfLines={1}>{name}</Text>
                  <Text variant="caption" tone="muted" numberOfLines={1}>{auth.session?.user.email}</Text>
                  <Text variant="caption" style={{ color: accent }}>{config ? `${config.name} profile` : 'Your profile across every sport'}</Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={22} color={colors.textDim} />
              </Pressable>

              {config && presentation ? <DrawerRow icon="account-outline" label={`My ${config.name}`} onPress={() => navigate(`/${presentation.routeSegment}/my-sport` as Href, true)} /> : null}
              <DrawerRow icon="account-edit-outline" label="Edit profile & account" onPress={() => navigate('/account')} />
              <DrawerRow icon="book-open-page-variant-outline" label="How to use SportStage" accent={accent} onPress={() => navigate('/manual')} />
              <DrawerRow icon="trophy-outline" label="Explore sports" accent={accent} onPress={() => navigate('/apps', true)} />
              <AdPrivacyOptions />
              <DrawerRow
                icon="information-outline"
                label="About SportStage"
                onPress={() => void Linking.openURL('https://www.sportstageapp.com/about')
                  .catch(() => Alert.alert('Could not open About SportStage', 'Please check your connection and try again.'))}
              />
              {auth.session ? <SportStageSignOutActions /> : null}
            </ScrollView>
          </SafeAreaView>
        </Animated.View>
      </View>
    </Modal>
  );
}

function DrawerRow({
  icon,
  label,
  accent,
  onPress,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  accent?: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.drawerRow, pressed && styles.pressed]}>
      <View style={styles.iconBubble}>
        <MaterialCommunityIcons name={icon} size={21} color={accent ?? colors.text} />
      </View>
      <Text variant="bodyStrong" style={styles.drawerRowLabel}>{label}</Text>
      <MaterialCommunityIcons name="chevron-right" size={21} color={colors.textDim} />
    </Pressable>
  );
}

function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'P';
}

const styles = StyleSheet.create({
  avatarButton: { width: 42, height: 42, borderRadius: 21, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  avatarButtonCompact: { width: 38, height: 38, borderRadius: 19 },
  avatarImage: { width: '100%', height: '100%' },
  pressed: { opacity: 0.72 },
  modalRoot: { flex: 1, flexDirection: 'row', justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0, 0, 0, 0.58)' },
  drawer: { height: '100%', backgroundColor: colors.bg, borderLeftWidth: 1, borderLeftColor: colors.border, boxShadow: '-6px 0px 18px rgba(0, 0, 0, 0.35)' },
  safeArea: { flex: 1 },
  drawerHeader: { minHeight: 64, paddingHorizontal: spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: colors.border },
  closeButton: { width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceElevated },
  drawerContent: { padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.sm },
  profileCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, marginBottom: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  largeAvatar: { width: 54, height: 54, borderRadius: 27, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  profileCopy: { flex: 1, minWidth: 0, gap: 2 },
  drawerRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  iconBubble: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceElevated },
  drawerRowLabel: { flex: 1 },
});
