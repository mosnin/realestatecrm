/**
 * Escape a string so it is a literal ILIKE operand, not a LIKE pattern.
 *
 * Postgres ILIKE treats `_` as "any one character" and `%` as "any run".
 * Both are legal in email local-parts (`jane_doe@`, `user+%tag@`). Passing
 * an unescaped email into `.ilike('email', email)` therefore matches other
 * people's addresses — `jane_doe@x.com` hits `jane.doe@x.com`. That was a
 * confirmed IDOR on public apply / tour book / the client portal.
 *
 * Use this whenever the pattern is an identity key (email), not a search
 * term the caller intended to wildcard.
 */
export function escapeIlikePattern(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}
