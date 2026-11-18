import React, { useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, View } from 'react-native';

import { colors } from '@/lib/wricket/presentation/design';
import { StageNotice, StageText } from './StageUI';

export function StageExternalLink({ title, url }: { title: string; url: string }) {
  const [failed, setFailed] = useState(false);
  const webProps = Platform.OS === 'web' ? { href: url, target: url.startsWith('https:') ? '_blank' : undefined, rel: 'noopener noreferrer' } : {};
  return <View style={{ gap: 8 }}>
    <Pressable {...webProps} accessibilityRole="link" accessibilityLabel={title} style={styles.link}
      onPress={Platform.OS === 'web' ? undefined : () => {
        setFailed(false);
        void Linking.openURL(url).catch(() => setFailed(true));
      }}>
      <StageText style={{ color: colors.accent }}>{title}</StageText>
    </Pressable>
    {failed ? <StageNotice>Could not open this link. Use the contact address shown below, or open the policy in your browser.</StageNotice> : null}
  </View>;
}

const styles = StyleSheet.create({
  link: { minHeight: 48, justifyContent: 'center', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
});
