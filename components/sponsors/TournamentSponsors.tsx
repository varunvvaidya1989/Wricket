import * as ImagePicker from 'expo-image-picker';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { useTournamentSponsors } from '@/hooks/useTournamentSponsors';
import { normalizeSponsor, SPONSOR_PLACEMENTS, type SponsorInput, type SponsorParent, type SponsorPlacement, type TournamentSponsor } from '@/lib/sponsors/types';
import { tournamentSponsorsApi } from '@/lib/supabase/tournamentSponsorsApi';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';
import { SponsorList, SponsorLogo } from './SponsorList';

const placementLabels: Record<SponsorPlacement, string> = { tournament: 'Tournament pages', match: 'Match feeds', share: 'Share cards' };
const blank: SponsorInput = { name: '', label: 'Official sponsor', description: '', websiteUrl: '', displayOrder: 0, isVisible: true, placements: [...SPONSOR_PLACEMENTS] };

export function TournamentSponsors({ parent, canManage = false, placement = 'tournament' }: {
  parent: SponsorParent; canManage?: boolean; placement?: SponsorPlacement;
}) {
  const { sponsors, loading, error, refresh } = useTournamentSponsors(parent);
  const [open, setOpen] = useState(false);
  return <View style={styles.section}>
    {canManage ? <View style={styles.heading}><View style={styles.flex}><Text variant="h3">Sponsors</Text><Text variant="caption" tone="muted">Recognize the partners supporting your tournament.</Text></View><Button title="Manage sponsors" size="sm" variant="secondary" onPress={() => setOpen(true)} /></View> : null}
    {loading && canManage ? <Text variant="caption" tone="muted">Loading sponsors…</Text> : null}
    {error ? <View><Text variant="caption" tone="muted">{error}</Text><Button title="Retry sponsors" variant="ghost" size="sm" onPress={() => void refresh()} /></View> : null}
    {!loading && !error && canManage && !sponsors.length ? <Text variant="caption" tone="muted">Add your first sponsor with a name, logo and website. You can add more at any time.</Text> : null}
    <SponsorList sponsors={sponsors} placement={placement} />
    {open ? <SponsorManager parent={parent} sponsors={sponsors} loading={loading} loadError={error} onClose={() => setOpen(false)} onRefresh={refresh} /> : null}
  </View>;
}

function SponsorManager({ parent, sponsors, loading, loadError, onClose, onRefresh }: {
  parent: SponsorParent; sponsors: TournamentSponsor[]; loading: boolean; loadError?: string; onClose: () => void; onRefresh: () => Promise<void>;
}) {
  const [editing, setEditing] = useState<TournamentSponsor>();
  const [draft, setDraft] = useState<SponsorInput>();
  const [asset, setAsset] = useState<ImagePicker.ImagePickerAsset>();
  const [removeLogo, setRemoveLogo] = useState(false);
  const [deleting, setDeleting] = useState<TournamentSponsor>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const edit = (sponsor?: TournamentSponsor) => {
    setEditing(sponsor); setDraft(sponsor ? { ...sponsor, placements: [...sponsor.placements] } : { ...blank, placements: [...blank.placements], displayOrder: Math.min(9999, sponsors.length ? Math.max(...sponsors.map(s => s.displayOrder)) + 10 : 0) });
    setAsset(undefined); setRemoveLogo(false); setError(undefined); setNotice(undefined); setDeleting(undefined);
  };
  const pickLogo = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
      if (!result.canceled && result.assets[0]) { setAsset(result.assets[0]); setRemoveLogo(false); }
    } catch { setError('Your photo library could not be opened. Please try again.'); }
  };
  const cleanup = async (path?: string) => {
    if (!path) return;
    try { await tournamentSponsorsApi.removeLogo(path); }
    catch { setNotice('Sponsor saved. The previous logo could not be removed from storage.'); }
  };
  const save = async () => {
    if (!draft || busy) return;
    setBusy(true); setError(undefined); setNotice(undefined);
    try {
      const validated = normalizeSponsor(draft);
      const path = asset ? await tournamentSponsorsApi.uploadLogo(parent, asset) : removeLogo ? undefined : editing?.logoPath;
      await tournamentSponsorsApi.save(parent, validated, editing, path);
      if (editing?.logoPath && editing.logoPath !== path) await cleanup(editing.logoPath);
      setDraft(undefined); setEditing(undefined); setAsset(undefined);
      await onRefresh();
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    if (!deleting || busy) return;
    setBusy(true); setError(undefined);
    try {
      await tournamentSponsorsApi.remove(parent, deleting);
      await cleanup(deleting.logoPath);
      setDeleting(undefined);
      await onRefresh();
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  };
  const close = () => { if (!busy) onClose(); };
  const patch = (value: Partial<SponsorInput>) => setDraft(current => current ? { ...current, ...value } : current);
  return <Modal visible transparent animationType="slide" onRequestClose={close}>
    <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.sheet} accessibilityViewIsModal>
        <View style={styles.heading}><Text variant="h2" style={styles.flex}>{draft ? editing ? 'Edit sponsor' : 'Add sponsor' : 'Tournament sponsors'}</Text><Button title="Close" variant="ghost" size="sm" disabled={busy} onPress={close} /></View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
          <Text variant="caption" tone="muted">Use public sponsor details here. Visible sponsors appear only in the locations you choose.</Text>
          {error || loadError ? <View><Text accessibilityRole="alert" tone="danger">{error ?? loadError}</Text><Button title="Refresh sponsors" variant="ghost" disabled={busy} onPress={() => void onRefresh()} /></View> : null}
          {notice ? <Text accessibilityLiveRegion="polite" variant="caption" tone="muted">{notice}</Text> : null}
          {draft ? <>
            <Field label="Sponsor name" value={draft.name} onChangeText={name => patch({ name })} maxLength={120} editable={!busy} placeholder="e.g. Apex Sports" />
            <Field label="Sponsor label" value={draft.label} onChangeText={label => patch({ label })} maxLength={60} editable={!busy} placeholder="e.g. Title sponsor, Gold partner" />
            <View style={styles.logoRow}><SponsorLogo uri={asset?.uri ?? (removeLogo ? undefined : editing?.logoUrl)} name={draft.name || 'SP'} /><Button title="Choose logo" variant="secondary" size="sm" disabled={busy} onPress={() => void pickLogo()} />{asset || (!removeLogo && editing?.logoPath) ? <Button title="Remove logo" variant="ghost" size="sm" disabled={busy} onPress={() => { setAsset(undefined); setRemoveLogo(true); }} /> : null}</View>
            <Text variant="caption" tone="dim">PNG, JPEG or WebP, up to 5 MB. A logo is optional.</Text>
            <Field label="Description (optional)" value={draft.description} onChangeText={description => patch({ description })} maxLength={600} editable={!busy} multiline />
            <Field label="Website (optional)" value={draft.websiteUrl} onChangeText={websiteUrl => patch({ websiteUrl })} maxLength={2048} editable={!busy} autoCapitalize="none" keyboardType="url" placeholder="https://example.com" />
            <Field label="Display order (lower numbers appear first)" value={Number.isNaN(draft.displayOrder) ? '' : String(draft.displayOrder)} onChangeText={value => patch({ displayOrder: value.trim() ? Number(value) : NaN })} maxLength={4} editable={!busy} keyboardType="number-pad" />
            <View style={styles.heading}><View style={styles.flex}><Text variant="bodyStrong">Show sponsor</Text><Text variant="caption" tone="muted">Turn off to keep this sponsor hidden.</Text></View><Switch accessibilityLabel="Show sponsor" value={draft.isVisible} disabled={busy} onValueChange={isVisible => patch({ isVisible })} /></View>
            <Text variant="bodyStrong">Show on</Text>
            {SPONSOR_PLACEMENTS.map(value => <Pressable key={value} accessibilityRole="checkbox" accessibilityState={{ checked: draft.placements.includes(value), disabled: busy }} disabled={busy} onPress={() => patch({ placements: draft.placements.includes(value) ? draft.placements.filter(p => p !== value) : [...draft.placements, value] })} style={styles.choice}><Text tone={draft.placements.includes(value) ? 'accent' : 'muted'}>{draft.placements.includes(value) ? '☑' : '☐'}  {placementLabels[value]}</Text></Pressable>)}
            <Text variant="caption" tone="dim">Share cards applies to tournaments with image sharing. Existing exported images keep the details they were created with.</Text>
            <View style={styles.actions}><Button title="Cancel" variant="secondary" disabled={busy} onPress={() => { setDraft(undefined); setError(undefined); }} /><Button title="Save sponsor" loading={busy} onPress={() => void save()} /></View>
          </> : <>
            <Button title="Add sponsor" disabled={busy || loading || Boolean(loadError)} onPress={() => edit()} />
            {!sponsors.length && !loading && !loadError ? <Text tone="muted">No sponsors yet. Add one or several partners to this tournament.</Text> : null}
            {sponsors.map(sponsor => <View key={sponsor.id} style={styles.row}>
              <View style={styles.logoRow}><SponsorLogo uri={sponsor.logoUrl} name={sponsor.name} /><View style={styles.flex}><Text variant="bodyStrong">{sponsor.name}</Text><Text variant="caption" tone="muted">{sponsor.label} · {sponsor.isVisible ? 'Visible' : 'Hidden'} · Order {sponsor.displayOrder}</Text><Text variant="caption" tone="dim">{sponsor.placements.map(p => placementLabels[p]).join(' · ')}</Text></View></View>
              {deleting?.id === sponsor.id ? <View style={styles.section}><Text>Remove {sponsor.name} from this tournament?</Text><View style={styles.actions}><Button title="Keep sponsor" variant="secondary" disabled={busy} onPress={() => setDeleting(undefined)} /><Button title="Confirm removal" variant="danger" loading={busy} onPress={() => void remove()} /></View></View>
                : <View style={styles.actions}><Button title={`Edit ${sponsor.name}`} variant="secondary" size="sm" disabled={busy} onPress={() => edit(sponsor)} /><Button title={`Remove ${sponsor.name}`} variant="ghost" size="sm" disabled={busy} onPress={() => setDeleting(sponsor)} /></View>}
            </View>)}
          </>}
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  </Modal>;
}

function Field({ label, ...props }: React.ComponentProps<typeof TextInput> & { label: string }) {
  return <View style={styles.section}><Text variant="caption" tone="muted">{label}</Text><TextInput {...props} accessibilityLabel={label} placeholderTextColor={colors.textDim} style={[styles.input, props.multiline && styles.multiline]} /></View>;
}
function errorMessage(cause: unknown) {
  return cause && typeof cause === 'object' && 'message' in cause ? String(cause.message) : 'The sponsor could not be saved. Please try again.';
}
const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  heading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.md },
  flex: { flex: 1, minWidth: 120 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: spacing.md },
  sheet: { width: '100%', maxWidth: 680, maxHeight: '92%', backgroundColor: colors.bg, borderRadius: radius.lg, padding: spacing.md, gap: spacing.md, borderWidth: 1, borderColor: colors.border },
  content: { gap: spacing.md, paddingBottom: spacing.lg },
  input: { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, padding: spacing.md, fontSize: 16, minHeight: 48 },
  multiline: { minHeight: 90, textAlignVertical: 'top' },
  logoRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  choice: { minHeight: 44, justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: spacing.sm },
  row: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, gap: spacing.md },
});
