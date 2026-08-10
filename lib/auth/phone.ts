export function normalizePhoneParts(countryCode: string, phoneNumber: string): string | null {
  const countryDigits = countryCode.replace(/\D/g, '');
  const localDigits = phoneNumber.replace(/\D/g, '').replace(/^0+/, '');
  if (countryDigits.length < 1 || countryDigits.length > 3 || localDigits.length < 6) return null;
  return normalizeE164Phone(`+${countryDigits}${localDigits}`);
}

export function normalizeE164Phone(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed.startsWith('+')) return null;
  const normalized = `+${trimmed.slice(1).replace(/\D/g, '')}`;
  return /^\+[1-9]\d{7,14}$/.test(normalized) ? normalized : null;
}
