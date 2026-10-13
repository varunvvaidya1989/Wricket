
import React, { useEffect, useState } from 'react';


import { StageSportPreferences } from '@/components/sports/platform/StageSportPreferences';
import { StageButton, StageField, StageIntro, StageNotice, StagePage } from '@/components/sports/platform/StageUI';
import { useAuth } from '@/components/providers/AuthProvider';


import { isSportReleased } from '@/lib/sports/platform/sportRelease';


import { SportOption, sportstageAccountApi } from '@/lib/supabase/sportstageAccountApi';



export default function OnboardingScreen() {
  const auth = useAuth();
  const metadata = auth.session?.user.user_metadata ?? {};
  const [displayName, setDisplayName] = useState(String(metadata.display_name ?? auth.profile?.displayName ?? ''));
  const metadataPrimaryCode = String(metadata.primary_sport_code ?? 'CRICKET');
  const initialPrimaryCode = isSportReleased(metadataPrimaryCode) ? metadataPrimaryCode : 'CRICKET';
  const metadataSportCodes = Array.isArray(metadata.sport_codes)
    ? metadata.sport_codes.filter((code): code is string => typeof code === 'string' && isSportReleased(code))
    : [];
  const [primarySportCode, setPrimarySportCode] = useState(initialPrimaryCode);
  const [selectedSportCodes, setSelectedSportCodes] = useState<string[]>(metadataSportCodes.length ? metadataSportCodes : [initialPrimaryCode]);
  const [sports, setSports] = useState<SportOption[]>([]);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState<string>();
  const load = () => { setError(undefined); void sportstageAccountApi.listSports().then(setSports).catch(cause => setError(cause instanceof Error ? cause.message : 'Could not load sports.')); };
  useEffect(load, []);

  const complete = async () => {
    if (!selectedSportCodes.length || !selectedSportCodes.includes(primarySportCode) || displayName.trim().length < 2) return;
    setSaving(true); setError(undefined);
    try {
      await sportstageAccountApi.saveSports(displayName, selectedSportCodes, primarySportCode);
      await auth.refreshProfile();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not finish setup.');
    } finally { setSaving(false); }
  };

  return <StagePage focused title="Your sports" footer={<StageButton primary title="Save & continue" onPress={() => void complete()} loading={saving} disabled={!sports.length || !selectedSportCodes.length || !selectedSportCodes.includes(primarySportCode) || displayName.trim().length < 2} />}>
    <StageIntro eyebrow="MAKE IT YOURS" title="What do you play?" description="Choose your sports. You can change these from your profile anytime." />
    <StageField label="Display name" placeholder="Display name" value={displayName} onChangeText={setDisplayName} />
    {error ? <StageNotice retry={load}>{error}</StageNotice> : !sports.length ? <StageNotice>Loading your sports…</StageNotice> : null}
    <StageSportPreferences sports={sports} selectedCodes={selectedSportCodes} primaryCode={primarySportCode} onToggle={code => toggleSport(code, selectedSportCodes, primarySportCode, setSelectedSportCodes, setPrimarySportCode)} onPrimary={setPrimarySportCode} />
    <StageNotice>{selectedSportCodes.length} selected · {sports.find(sport => sport.code === primarySportCode)?.name ?? primarySportCode} is primary</StageNotice>
    <StageButton title="Sign out" loading={saving} onPress={() => { setSaving(true); void auth.signOutCurrentDevice().catch(cause => setError(cause instanceof Error ? cause.message : 'Could not sign out.')).finally(() => setSaving(false)); }} />
  </StagePage>;
}

function toggleSport(code: string, selected: string[], primary: string, setSelected: (codes: string[]) => void, setPrimary: (code: string) => void) {
  if (selected.includes(code)) {
    const next = selected.filter(item => item !== code);
    setSelected(next);
    if (primary === code) setPrimary(next[0] ?? '');
  } else {
    setSelected([...selected, code]);
    if (!primary) setPrimary(code);
  }
}
