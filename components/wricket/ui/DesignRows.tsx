import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { DesignIcon } from './DesignIcon';
import { colors } from '@/lib/wricket/presentation/design';
import { iconPaths } from '@/lib/wricket/presentation/icons';

export function SectionHeading({ title, action, onPress }: { title: string; action?: string; onPress?: () => void }) {
  return <View style={styles.heading}><Text variant="overline" tone="muted">{title}</Text>
    {action ? <Pressable accessibilityRole="button" onPress={onPress} style={styles.textAction}>
      <Text style={{ fontSize: 10 }} tone="accent">{action}</Text><DesignIcon name="arrow" size={14} color={colors.accent} />
    </Pressable> : null}</View>;
}
export function LinkRow({ title, detail, icon, onPress }: { title: string; detail: string; icon: keyof typeof iconPaths; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress} style={styles.link}>
    <View style={styles.icon}><DesignIcon name={icon} size={17} color={colors.accent} /></View>
    <View style={{ flex: 1 }}><Text variant="bodyStrong">{title}</Text><Text style={styles.detail}>{detail}</Text></View>
    <DesignIcon name="arrow" size={17} />
  </Pressable>;
}
export function TaskRow({ title, detail, organiser, onPress }: { title: string; detail: string; organiser?: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`${title}: ${detail}`} onPress={onPress}
    style={[styles.task, organiser && { backgroundColor: '#29271b', borderColor: '#50482b' }]}>
    <DesignIcon name={organiser ? 'trophy' : 'bat'} size={20} color={colors.accent} />
    <View style={{ flex: 1 }}><Text variant="bodyStrong" style={styles.taskTitle}>{title}</Text><Text style={styles.taskDetail}>{detail}</Text></View>
    <DesignIcon name="arrow" size={20} color={colors.accent} />
  </Pressable>;
}
const styles = StyleSheet.create({
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, minHeight: 32 },
  textAction: { minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: 6 },
  link: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 16, borderBottomWidth: 1, borderColor: colors.border },
  icon: { width: 37, height: 37, borderRadius: 11, borderWidth: 1, borderColor: '#394b38', backgroundColor: '#1e2e20', alignItems: 'center', justifyContent: 'center' },
  detail: { fontSize: 10, lineHeight: 15, color: colors.textMuted, marginTop: 4 },
  task: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, backgroundColor: '#1b3020', borderWidth: 1, borderColor: '#365439', borderRadius: 11 },
  taskTitle: { fontSize: 11, lineHeight: 16, textAlign: 'center', marginBottom: 3 },
  taskDetail: { fontSize: 9, lineHeight: 14, color: '#b2c7ab', textAlign: 'center' },
});
