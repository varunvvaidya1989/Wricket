import { useGlobalSearchParams, usePathname, useRouter } from 'expo-router';
import React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SectionRow } from '@/components/wricket/ui/SectionRow';
import { WricketHeader } from '@/components/wricket/ui/WricketHeader';

const sections = [{ id: '/wricket/live', label: 'Now' }, { id: '/wricket/my-wricket', label: 'My cricket' },
  { id: '/wricket/search', label: 'Explore' }] as const;

export function WricketRootHeader() {
  const path = usePathname();
  const router = useRouter();
  const { section } = useGlobalSearchParams<{ section?: string }>();
  if (!sections.some(item => item.id === path) || (path === '/wricket/my-wricket' && ['matches', 'teams', 'tournaments', 'performance'].includes(section ?? ''))) return null;
  return <SafeAreaView edges={['top', 'left', 'right']}>
    <WricketHeader title="Wricket" />
    <SectionRow label="Cricket sections" items={sections} selected={path as typeof sections[number]['id']}
      onSelect={route => router.replace(route)} />
  </SafeAreaView>;
}
