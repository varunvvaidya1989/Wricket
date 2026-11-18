/** Phone-only accounts may keep email empty; an existing email cannot be removed here. */
export function accountEmailUpdate(current: string | undefined, draft: string): string | undefined {
  const email = draft.trim();
  if (!email) {
    if (current) throw new Error('Enter your account email.');
    return undefined;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid email address.');
  return email.toLowerCase() === current?.trim().toLowerCase() ? undefined : email;
}
