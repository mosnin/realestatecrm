import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function normalizeRootDomain(value: string) {
  const sanitized = value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .split('/')[0]
    .replace(/\.$/, '')
    .replace(/^www\./, '');

  return sanitized;
}

export const protocol =
  process.env.NODE_ENV === 'production' ? 'https' : 'http';

const configuredRootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN;
const defaultRootDomain =
  process.env.NODE_ENV === 'production'
    ? 'www.usechippi.com'
    : 'localhost:3000';

if (!configuredRootDomain && process.env.NODE_ENV !== 'production') {
  console.warn(
    '[chippi] NEXT_PUBLIC_ROOT_DOMAIN is not set. Intake URLs will use the default domain:',
    defaultRootDomain,
    '— set this env var to match your actual deployment domain.'
  );
}

export const rootDomain =
  normalizeRootDomain(configuredRootDomain || defaultRootDomain);

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Sanitize a user-provided URL for safe use in href attributes.
 * Only allows http: and https: protocols. Returns '#' for invalid/dangerous URLs.
 * Prevents javascript:, data:, vbscript: protocol XSS.
 */
export function safeHref(url: string | null | undefined): string {
  if (!url) return '#';
  const trimmed = url.trim();
  if (!trimmed) return '#';
  // Protocol-relative ("//evil.com") resolves to an off-origin absolute URL
  // when parsed against an https base, so it would otherwise slip through the
  // http(s) check below. Block it up front, matching the relative-only intent.
  if (trimmed.startsWith('//')) return '#';
  try {
    const parsed = new URL(trimmed, 'https://placeholder.invalid');
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return trimmed;
    }
    return '#';
  } catch {
    // Relative URLs starting with / are safe
    if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return trimmed;
    return '#';
  }
}

/**
 * Sanitize a URL intended for an <img src> attribute. Modern browsers
 * already refuse to execute javascript: / data: in image src, but
 * defense-in-depth: validate the scheme on our side so we never even
 * hand a hostile URL to the browser. Allows http(s) and same-origin
 * relative paths; rejects everything else (returns null so the caller
 * can render a placeholder icon instead of a broken image).
 *
 * Used by the chat markdown renderer where the model could in theory
 * emit `![alt](javascript:...)` or `![alt](data:text/html,...)`. Real
 * exploitation requires browser bugs we don't depend on; this is the
 * belt to the browser's suspenders.
 */
export function safeImageSrc(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  // Same protocol-relative guard as safeHref: "//evil.com" is an off-origin
  // absolute URL in disguise, not a same-origin relative path.
  if (trimmed.startsWith('//')) return null;
  try {
    const parsed = new URL(trimmed, 'https://placeholder.invalid');
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return trimmed;
    }
    return null;
  } catch {
    if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return trimmed;
    return null;
  }
}

/**
 * Format a phone number as the user types. Strips non-digits and renders the
 * (XXX) XXX-XXXX shape progressively for US-style numbers; an 11-digit number
 * renders as +X (XXX) XXX-XXXX. Pure function so it's predictable and testable —
 * this is presentation only, NOT validation.
 *
 * Single source of truth so every applicant-facing input (the intake chat and
 * the tour-booking details form) auto-formats phone numbers identically.
 */
export function formatPhoneAsTyped(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 11);
  if (digits.length === 0) return '';
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  if (digits.length <= 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return `+${digits.slice(0, 1)} (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
}

/**
 * Format a STORED phone number for display. Prettifies US 10- and 11-digit
 * numbers as "(415) 555-0123" / "+1 (415) 555-0123"; ANY other shape
 * (international, an extension, something already formatted, a partial) is
 * returned trimmed but otherwise untouched, so we never mangle a non-US number
 * the way the as-typed formatter would (it slices to 11 digits). Null/blank →
 * empty string. Presentation only, not validation.
 */
export function formatPhoneDisplay(raw: string | null | undefined): string {
  if (!raw) return '';
  const trimmed = String(raw).trim();
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits[0] === '1') {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return trimmed;
}
