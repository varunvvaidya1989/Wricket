import { useLocalSearchParams } from 'expo-router';
import React from 'react';

import { StageExternalLink } from '@/components/sports/platform/StageExternalLink';
import { StageIntro, StageNotice, StagePage, StageText } from '@/components/sports/platform/StageUI';
import { PRIVACY_EMAIL, PRIVACY_POLICY_URL, SUPPORT_EMAIL, supportEmailUrl, supportTopic } from '@/lib/support/contact';

export default function SupportScreen() {
  const params = useLocalSearchParams<{ topic?: string | string[] }>();
  const deletion = supportTopic(params.topic) === 'account-deletion';
  return <StagePage focused title={deletion ? 'Deletion support' : 'Privacy & support'} eyebrow="SPORTSTAGE">
    <StageIntro eyebrow={deletion ? 'ACCOUNT DATA' : 'CONTACT & PRIVACY'}
      title={deletion ? 'Ask for account deletion.' : 'A person can help.'}
      description={deletion ? 'Request deletion even if you cannot sign in, or shared match records prevent automatic deletion.' : 'Get help with your account, a match or your personal data.'} />
    <StageExternalLink title={deletion ? 'Compose account deletion request' : 'Compose support email'} url={supportEmailUrl(deletion ? 'account-deletion' : 'general')} />
    <StageText variant="small" muted>Your email app opens a draft. Review and send it to make the request.</StageText>
    <StageText selectable>{SUPPORT_EMAIL}</StageText>
    {deletion ? <StageNotice>Include your account sign-in email so support can identify your account. Identity verification may be needed. Do not send your password or verification codes. Ask support to explain any records retained and the reason.</StageNotice>
      : <StageExternalLink title="Request account deletion" url={supportEmailUrl('account-deletion')} />}
    <StageText variant="eyebrow" muted>PRIVACY</StageText>
    <StageExternalLink title="Read the privacy policy" url={PRIVACY_POLICY_URL} />
    <StageExternalLink title="Email a privacy question" url={`mailto:${PRIVACY_EMAIL}`} />
    <StageText selectable variant="small" muted>{PRIVACY_EMAIL}</StageText>
    <StageNotice>Account deletion is different from signing out or clearing data on a device. Shared sporting history may need additional review; support can explain the next steps for your request.</StageNotice>
  </StagePage>;
}
