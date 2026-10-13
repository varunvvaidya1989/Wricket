import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { colors } from '@/lib/wricket/presentation/design';

export function WricketProfileDrawerProvider({ children }: { children: React.ReactNode }) { return <>{children}</>; }
export function WricketAvatarButton() {
  const router = useRouter();
  return <Pressable accessibilityRole="button" accessibilityLabel="Open cricket profile" onPress={() => router.push('/wricket/me')}
    style={{ minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' }}>
    <MaterialCommunityIcons name="account-circle-outline" size={26} color={colors.accent} />
  </Pressable>;
}
