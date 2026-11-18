type AuthErrorLike = {
  code?: unknown;
  status?: unknown;
  message?: unknown;
  name?: unknown;
};

/** Converts Supabase Auth failures into safe, actionable copy for users. */
export function authErrorMessage(cause: unknown, fallback = 'Something went wrong. Please try again.'): string {
  const error = isErrorLike(cause) ? cause : undefined;
  const code = String(error?.code ?? '').toLowerCase();
  const status = Number(error?.status ?? 0);
  const raw = String(error?.message ?? '').toLowerCase();

  const deletionMessages: Record<string, string> = {
    account_deletion_sign_in: 'Sign in again before deleting your account.',
    account_deletion_confirmation: 'Type DELETE to confirm account deletion.',
    account_deletion_shared_records: 'Your account is linked to shared sport records. Transfer owned competitions and contact SportStage support to preserve match history before deleting.',
    account_deletion_sponsor_media: 'Remove or replace your linked sponsor logos before deleting your account.',
    account_deletion_media_remains: 'Some account files could not be removed. Your account is still available. Check your connection and try again.',
  };
  if (deletionMessages[raw]) return deletionMessages[raw];

  const byCode: Record<string, string> = {
    invalid_credentials: 'The email or password is incorrect. Check both fields and try again.',
    email_not_confirmed: 'Confirm your email address before signing in. You can request a new verification email below.',
    user_banned: 'This account is currently unavailable. Contact SportStage support for help.',
    email_exists: 'An account already exists with this email. Sign in or reset your password instead.',
    user_already_exists: 'An account already exists with this email. Sign in or reset your password instead.',
    phone_exists: 'This phone number is already connected to another SportStage account.',
    weak_password: 'That password is too weak. Use at least eight characters and avoid common or compromised passwords.',
    same_password: 'Choose a password you have not used for this account before.',
    over_request_rate_limit: 'Too many attempts were made. Wait a few minutes before trying again.',
    over_email_send_rate_limit: 'A message was sent recently. Wait about a minute before requesting another email.',
    over_sms_send_rate_limit: 'An SMS was requested recently. Wait a minute before requesting another code.',
    phone_provider_disabled: 'Phone sign-in is not available yet. Use email sign-in for now.',
    sms_send_failed: 'Your SMS could not be sent. Wait a minute and try again, or use email sign-in.',
    sms_hook_timeout: 'SMS delivery is taking longer than expected. Wait before requesting another code.',
    hook_timeout: 'SMS delivery is taking longer than expected. Wait before requesting another code.',
    otp_expired: 'This verification code or link has expired or was already used. Request a new one.',
    flow_state_expired: 'This sign-in session expired. Return to sign in and request a new link.',
    flow_state_not_found: 'This sign-in link is no longer valid. Request a new link and use the latest email.',
    validation_failed: 'Check the information you entered and try again.',
    signup_disabled: 'New account creation is temporarily unavailable.',
    email_provider_disabled: 'Email and password sign-in is temporarily unavailable.',
    otp_disabled: 'One-time sign-in is temporarily unavailable. Use email and password instead.',
    reauthentication_needed: 'For security, sign in again before making this change.',
    reauthentication_not_valid: 'Your current password or verification code is incorrect.',
    session_not_found: 'Your session has expired. Sign in again to continue.',
  };
  if (byCode[code]) return byCode[code];
  if (status === 429) return 'Too many attempts were made. Wait a few minutes before trying again.';
  if (status >= 500) return 'SportStage sign-in is temporarily unavailable. Please try again shortly.';
  if (cause instanceof TypeError || raw.includes('failed to fetch') || raw.includes('network request failed')) {
    return 'Could not connect to SportStage. Check your internet connection and try again.';
  }
  return fallback;
}

function isErrorLike(value: unknown): value is AuthErrorLike {
  return typeof value === 'object' && value !== null;
}
