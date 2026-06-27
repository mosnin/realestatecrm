/**
 * Shared formatting utilities — single source of truth for the whole app.
 * Import from here instead of defining local copies in each file.
 */

/**
 * Returns a human-readable relative time string for a given date.
 * Handles Date objects, ISO strings, and numeric timestamps.
 */
export function timeAgo(date: Date | string | number): string {
  const d = new Date(date);
  // Never leak "Invalid Date" into the UI — a missing/garbage timestamp
  // renders as nothing, not an error string.
  if (Number.isNaN(d.getTime())) return '';
  const diff = Date.now() - d.getTime();
  // A future timestamp (clock skew, a scheduled item) reads as "just now"
  // rather than a nonsensical negative age.
  if (diff < 60_000) return 'just now';
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Formats a number as standard USD currency (no cents).
 * e.g. 1500000 → "$1,500,000". A non-finite value (NaN / Infinity, e.g. a
 * missing field that slipped past a guard) renders as "$0", never "$NaN".
 */
export function formatCurrency(n: number): string {
  if (!Number.isFinite(n)) return '$0';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n);
}

/** Alias for formatCurrency — use in lead/contact money contexts. */
export const formatMoney = formatCurrency;

/**
 * Formats a number as compact USD for chart axes and tooltips.
 * e.g. 1500000 → "$1.5M", 15000 → "$15K", -2000000 → "-$2.0M".
 * Non-finite input renders as "$0" rather than "$NaN".
 */
export function formatCompact(n: number): string {
  if (!Number.isFinite(n)) return '$0';
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

/**
 * Returns up to 2 uppercase initials from a display name.
 * e.g. "Jane Doe" → "JD", "Alice" → "AL".
 *
 * Accepts null/undefined (User.name and Contact.name are nullable) and any
 * non-string without throwing — an avatar should always have a fallback glyph,
 * never crash the row it's in.
 */
export function getInitials(name: string | null | undefined): string {
  if (typeof name !== 'string') return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return parts[0].slice(0, 2).toUpperCase();
}

/**
 * Returns a human-friendly label for a follow-up date relative to today.
 * e.g. "Today", "Tomorrow", "In 3d", "2d overdue", "Mar 15"
 */
export function formatFollowUpDate(dateVal: Date | string | null | undefined): string {
  if (!dateVal) return '';
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return '';
  // Compare CALENDAR days, not raw timestamps: a follow-up at 3pm today is
  // "Today", not "Tomorrow". Normalizing both sides to start-of-day (and
  // rounding) avoids the off-by-one that Math.ceil on a partial day produced.
  const startOfDay = (x: Date) => new Date(x.toDateString()).getTime();
  const today = new Date();
  const diffDays = Math.round((startOfDay(d) - startOfDay(today)) / 86_400_000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays === -1) return 'Yesterday';
  if (diffDays < 0) return `${Math.abs(diffDays)}d overdue`;
  if (diffDays <= 7) return `In ${diffDays}d`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Converts a date to an HTML date-input value string ("YYYY-MM-DD").
 * Returns "" for null / invalid dates.
 */
export function toDateInputValue(dateVal: Date | string | null | undefined): string {
  if (!dateVal) return '';
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}
