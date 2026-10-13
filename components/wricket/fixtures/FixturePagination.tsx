import React from 'react';
import { View } from 'react-native';
import { Button } from '@/components/wricket/ui/Button';
import { Text } from '@/components/wricket/ui/Text';
import { spacing } from '@/lib/theme/spacing';

export const fixturePageSize = 40;
export function FixturePagination({ total, page, onPage }: { total: number; page: number; onPage: (page: number) => void }) {
  const count = Math.max(1, Math.ceil(total / fixturePageSize));
  const current = Math.min(page, count - 1);
  if (count === 1) return null;
  return <View style={{ gap: spacing.sm }}>
    <Text variant="caption" tone="muted" accessibilityLiveRegion="polite">Fixtures {current * fixturePageSize + 1}-{Math.min((current + 1) * fixturePageSize, total)} of {total}</Text>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
      <Button title="First fixtures" size="sm" variant="secondary" disabled={current === 0} onPress={() => onPage(0)} />
      <Button title="Previous fixtures" size="sm" variant="secondary" disabled={current === 0} onPress={() => onPage(current - 1)} />
      <Button title="Next fixtures" size="sm" variant="secondary" disabled={current === count - 1} onPress={() => onPage(current + 1)} />
      <Button title="Last fixtures" size="sm" variant="secondary" disabled={current === count - 1} onPress={() => onPage(count - 1)} />
    </View>
  </View>;
}
