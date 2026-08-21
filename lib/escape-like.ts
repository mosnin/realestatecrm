/**
 * Escape LIKE/ILIKE metacharacters so a value is matched literally
 * (still case-insensitively when used with `.ilike`).
 *
 * `%` and `_` are legal in email local-parts. Without this, a client
 * registered as `%@gmail.com` matches every gmail row — the wildcard
 * injection that lib/client-portal-data.ts already closed on Contact.
 */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}
