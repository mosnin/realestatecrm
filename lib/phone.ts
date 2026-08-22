/**
 * Shared phone normalization. SMS, voice, and the compliance gate must
 * agree on the same E.164 form — otherwise a STOP recorded as +14155550123
 * is missed when we look up +114155550123, and Telnyx is asked to deliver
 * to a number that does not exist.
 */

/**
 * Normalize a loose phone string to E.164, or null if it can't be one.
 *
 * US numbers land in Contact.phone many ways: (415) 555-0123, 4155550123,
 * 14155550123, +1 415 555 0123. Blindly prefixing +1 whenever there's no
 * plus turns a stored NANP number that already has the country digit
 * (`14155550123`) into `+114155550123` — Telnyx rejects that, or worse,
 * attempts delivery to the wrong destination.
 */
export function toE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) return null;

  let e164: string;
  if (hasPlus) {
    e164 = `+${digits}`;
  } else if (digits.length === 10) {
    e164 = `+1${digits}`;
  } else if (digits.length === 11 && digits.startsWith('1')) {
    e164 = `+${digits}`;
  } else {
    // International number entered without +. Don't invent a country code.
    e164 = `+${digits}`;
  }

  return /^\+\d{10,15}$/.test(e164) ? e164 : null;
}
