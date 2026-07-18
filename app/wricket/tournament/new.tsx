import React, { useState } from 'react';
import { View, StyleSheet, TextInput, Pressable, Alert } from 'react-native';
import { useRouter } from 'expo-router';

import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { colors } from '@/lib/theme/colors';
import { spacing, radius } from '@/lib/theme/spacing';
import { createTournament } from '@/lib/wricket/db/repo';
import { MatchFormat, FORMAT_LABEL } from '@/lib/wricket/domain/types';

const FORMATS: MatchFormat[] = ['BOX', 'TURF', 'TURF_TEST'];

export default function NewTournamentScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [format, setFormat] = useState<MatchFormat>('TURF');
  const [saving, setSaving] = useState(false);

  const onCreate = async () => {
    if (name.trim().length < 2) {
      Alert.alert('Name needed', 'Give your tournament a name.');
      return;
    }
    setSaving(true);
    try {
      const t = await createTournament({
        name: name.trim(),
        format,
        startDate: Date.now(),
      });
      router.replace({
        pathname: '/wricket/tournament/[id]',
        params: { id: t.id },
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen scroll>
      <View style={{ gap: spacing.xl, paddingTop: spacing.lg }}>
        <View>
          <Text variant="overline" tone="muted">Step 1 of 1</Text>
          <Text variant="h1" style={{ marginTop: spacing.xs }}>Create tournament</Text>
        </View>

        <View>
          <Text variant="caption" tone="muted" style={{ marginBottom: spacing.sm }}>NAME</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Sunday League 2026"
            placeholderTextColor={colors.textDim}
            style={styles.input}
            autoFocus
          />
        </View>

        <View>
          <Text variant="caption" tone="muted" style={{ marginBottom: spacing.sm }}>FORMAT</Text>
          <View style={{ gap: spacing.sm }}>
            {FORMATS.map(f => (
              <Pressable
                key={f}
                onPress={() => setFormat(f)}
                style={[
                  styles.formatChip,
                  format === f && styles.formatChipActive,
                ]}
              >
                <Text variant="bodyStrong" style={format === f ? { color: colors.accentInk } : undefined}>
                  {FORMAT_LABEL[f]}
                </Text>
                <Text
                  variant="caption"
                  tone={format === f ? undefined : 'muted'}
                  style={format === f ? { color: colors.accentInk, opacity: 0.7 } : undefined}
                >
                  {formatHint(f)}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <Button title="Create tournament" loading={saving} onPress={onCreate} fullWidth size="lg" />
      </View>
    </Screen>
  );
}

function formatHint(f: MatchFormat): string {
  switch (f) {
    case 'BOX':
      return '5 overs · 6-a-side · custom rules';
    case 'TURF':
      return '10 overs · 11-a-side · standard';
    case 'TURF_TEST':
      return '5 overs · 2 innings · follow-on';
  }
}

const styles = StyleSheet.create({
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    color: colors.text,
    fontSize: 16,
  },
  formatChip: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  formatChipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
});
