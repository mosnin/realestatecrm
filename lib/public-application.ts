/**
 * Public application helpers.
 *
 * Submissions are validated and scored against the dynamic intake form config
 * (see app/api/public/apply). These helpers are the provider-agnostic bits the
 * apply routes still rely on for de-duplication / idempotency.
 */

export function normalizePhone(input: string) {
  return input.replace(/\D/g, '');
}

export function applicationFingerprintKey(input: {
  slug: string;
  legalName: string;
  phone?: string | null;
  email?: string | null;
}) {
  const normalizedName = input.legalName.trim().toLowerCase();
  const normalizedPhone = input.phone ? normalizePhone(input.phone) : '';
  const normalizedEmail = (input.email ?? '').trim().toLowerCase();
  return `${input.slug}:${normalizedName}:${normalizedPhone}:${normalizedEmail}`;
}
