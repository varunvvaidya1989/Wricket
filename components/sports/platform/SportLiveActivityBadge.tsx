import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { colors } from '@/lib/theme/colors';

interface SportLiveActivityBadgeProps {
  count: number;
  appearance?: 'strip' | 'card';
}

export function SportLiveActivityBadge({
  count,
  appearance = 'strip',
}: SportLiveActivityBadgeProps) {
  const liveCount = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  const hasLive = liveCount > 0;

  return (
    <View
      accessibilityLabel={hasLive ? `${liveCount} live matches` : 'No live matches'}
      style={[
        styles.base,
        appearance === 'card' && styles.card,
        appearance === 'card' && (hasLive ? styles.cardLive : styles.cardNone),
      ]}
    >
      <Text style={[
        styles.text,
        appearance === 'card' && styles.cardText,
        !hasLive && styles.noneText,
      ]}>
        {hasLive ? `\u25CF ${liveCount} live` : '\u2014 none'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignSelf: 'center',
  },
  card: {
    paddingVertical: 4,
    paddingHorizontal: 9,
    borderRadius: 999,
  },
  cardLive: {
    backgroundColor: 'rgba(255, 92, 92, 0.12)',
  },
  cardNone: {
    backgroundColor: colors.border,
  },
  text: {
    color: colors.live,
    fontFamily: 'IBMPlexMono_500Medium',
    fontSize: 8,
  },
  cardText: {
    fontSize: 9,
  },
  noneText: {
    color: colors.textDim,
  },
});
