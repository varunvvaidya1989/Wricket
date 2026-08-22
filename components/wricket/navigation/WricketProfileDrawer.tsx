import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
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
import { legacyPlayerLinkApi } from '@/lib/supabase/legacyPlayerLinkApi';
import { PlayerProfile, playerProfileApi } from '@/lib/supabase/playerProfileApi';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';

interface ProfileDrawerContextValue {
  openProfileDrawer(): void;
}

const ProfileDrawerContext = createContext<ProfileDrawerContextValue | null>(null);

export function WricketProfileDrawerProvider({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  return (
    <ProfileDrawerContext.Provider value={{ openProfileDrawer: () => setVisible(true) }}>
      {children}
      <WricketProfileDrawer visible={visible} onClose={() => setVisible(false)} />
    </ProfileDrawerContext.Provider>
  );
}

export function WricketAvatarButton() {
  const context = useContext(ProfileDrawerContext);
  const auth = useAuth();
  const name = auth.profile?.displayName ?? auth.session?.user.email ?? 'Player';
  if (!context) throw new Error('WricketAvatarButton must be used within WricketProfileDrawerProvider');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Open cricket profile"
      onPress={context.openProfileDrawer}
      style={({ pressed }) => [styles.avatarButton, pressed && styles.pressed]}
    >
      {auth.profile?.avatarUrl
        ? <Image source={{ uri: auth.profile.avatarUrl }} style={styles.avatarImage} />
        : <Text variant="bodyStrong" tone="accent">{initials(name)}</Text>}
    </Pressable>
  );
}

function WricketProfileDrawer({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const router = useRouter();
  const auth = useAuth();
  const { width } = useWindowDimensions();
  const drawerWidth = Math.min(width * 0.88, 380);
  const translateX = useRef(new Animated.Value(drawerWidth)).current;
  const [player, setPlayer] = useState<PlayerProfile>();
  const [showLegacyLink, setShowLegacyLink] = useState(false);
  const name = auth.profile?.displayName ?? auth.session?.user.email?.split('@')[0] ?? 'Cricket profile';

  useEffect(() => {
    if (!visible) return;
    translateX.setValue(drawerWidth);
    Animated.timing(translateX, { toValue: 0, duration: 220, useNativeDriver: true }).start();
  }, [drawerWidth, translateX, visible]);

  useEffect(() => {
    if (!visible || !auth.session) {
      setPlayer(undefined);
      setShowLegacyLink(false);
      return;
    }
    let active = true;
    void Promise.all([
      playerProfileApi.getMine(auth.session.user.id),
      legacyPlayerLinkApi.resolve(name),
    ]).then(([nextPlayer, resolution]) => {
      if (!active) return;
      setPlayer(nextPlayer);
      setShowLegacyLink(resolution.status === 'VERIFIED_MATCH' || resolution.status === 'CONTACT_CONFLICT');
    }).catch(() => undefined);
    return () => { active = false; };
  }, [auth.session, name, visible]);

  const navigate = useCallback((href: Parameters<typeof router.push>[0]) => {
    onClose();
    requestAnimationFrame(() => router.push(href));
  }, [onClose, router]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close cricket profile" onPress={onClose} style={styles.backdrop} />
        <Animated.View style={[styles.drawer, { width: drawerWidth, transform: [{ translateX }] }]}>
          <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
            <View style={styles.drawerHeader}>
              <Text variant="overline" tone="muted">CRICKET PROFILE</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Close cricket profile" onPress={onClose} style={styles.closeButton}>
                <MaterialCommunityIcons name="close" size={22} color={colors.text} />
              </Pressable>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.drawerContent}>
              <Pressable
                disabled={!player}
                onPress={() => player && navigate({ pathname: '/wricket/player/[id]', params: { id: player.id } })}
                style={({ pressed }) => [styles.profileCard, pressed && styles.pressed]}
              >
                <View style={styles.largeAvatar}>
                  {auth.profile?.avatarUrl
                    ? <Image source={{ uri: auth.profile.avatarUrl }} style={styles.avatarImage} />
                    : <Text variant="h2" tone="accent">{initials(name)}</Text>}
                </View>
                <View style={styles.profileCopy}>
                  <Text variant="h3" numberOfLines={1}>{name}</Text>
                  <Text variant="caption" tone="muted" numberOfLines={1}>{auth.session?.user.email ?? 'Sign in to personalize Wricket'}</Text>
                  <Text variant="caption" tone="accent">{player ? `${roleLabel(player.role)} profile` : 'SportStage profile'}</Text>
                </View>
                {player ? <MaterialCommunityIcons name="chevron-right" size={22} color={colors.textDim} /> : null}
              </Pressable>

              <DrawerRow icon="account-edit-outline" label={auth.session ? 'Edit player & account' : 'Sign in or create account'} onPress={() => navigate('/account')} />
              {showLegacyLink ? <DrawerRow icon="link-variant" label="Link player from AuctionYodha" accent onPress={() => navigate('/wricket/ay-profile-link')} /> : null}
              <DrawerRow icon="trophy-outline" label="Explore sports" accent onPress={() => { onClose(); requestAnimationFrame(() => router.replace('/apps')); }} />
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

function DrawerRow({ icon, label, accent, onPress }: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  accent?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.drawerRow, pressed && styles.pressed]}>
      <View style={styles.iconBubble}>
        <MaterialCommunityIcons name={icon} size={21} color={accent ? colors.accent : colors.text} />
      </View>
      <Text variant="bodyStrong" style={styles.drawerRowLabel}>{label}</Text>
      <MaterialCommunityIcons name="chevron-right" size={21} color={colors.textDim} />
    </Pressable>
  );
}

function roleLabel(role: PlayerProfile['role']) {
  return { BAT: 'Batter', BOWL: 'Bowler', AR: 'All-rounder', WK: 'Wicket-keeper' }[role];
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || 'P';
}

const styles = StyleSheet.create({
  avatarButton: { width: 42, height: 42, borderRadius: 21, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentMuted, borderWidth: 1, borderColor: colors.accent },
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
  largeAvatar: { width: 54, height: 54, borderRadius: 27, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentMuted },
  profileCopy: { flex: 1, gap: 2 },
  drawerRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  iconBubble: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceElevated },
  drawerRowLabel: { flex: 1 },
});
