export const SUPPORT_EMAIL = 'admin@sportstageapp.com';
export const PRIVACY_EMAIL = 'privacy@sportstageapp.com';
export const PRIVACY_POLICY_URL = 'https://www.sportstageapp.com/privacy';

export type SupportTopic = 'account-deletion' | 'general';

export function supportTopic(value: string | string[] | undefined): SupportTopic {
  return value === 'account-deletion' ? value : 'general';
}

export function supportEmailUrl(topic: SupportTopic): `mailto:${string}` {
  const subject = topic === 'account-deletion' ? 'SportStage account deletion request' : 'SportStage support request';
  const body = topic === 'account-deletion'
    ? 'I would like to request deletion of my SportStage account and associated personal data.\n\nAccount sign-in email: \n\nPlease let me know if identity verification or other steps are needed, and explain any data retained and why.'
    : 'Please describe the issue, the app version, and what you were trying to do.\n\n';
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
