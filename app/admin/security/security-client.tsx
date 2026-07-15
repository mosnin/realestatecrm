'use client';

import { useState, useMemo, Fragment } from 'react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, ChevronDown, ChevronRight, ShieldAlert } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { cn } from '@/lib/utils';
import { SURFACE_CARD } from '@/components/ui/surface-card';
import { SECTION_LABEL, CAPTION } from '@/lib/typography';

// ── Types ───────────────────────────────────────────────────────────────────

export interface SecurityEvent {
  id: string;
  clerkId: string | null;
  actorId: string | null;
  ipAddress: string | null;
  /** The specific admin verb (metadata.adminAction), e.g. 'dsar_export'. */
  adminAction: string;
  /** The affected resource id (resourceId) — the target of the action. */
  target: string | null;
  reason: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

interface UserInfo {
  name: string | null;
  email: string;
}

interface SecurityEventsClientProps {
  events: SecurityEvent[];
  userMap: Record<string, UserInfo>;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatAbsolute(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

// Verbs whose action is destructive / identity-critical get a warmer badge so
// they stand out in a review scan. Everything else is neutral.
const SENSITIVE_VERBS = new Set([
  'delete_user',
  'impersonate_user',
  'change_user_role',
  'refund',
  'issue_credit',
  'delete_brokerage',
  'dsar_export',
  'broadcast',
  'send_broadcast',
  'dlq_replay',
  'replay_dlq',
]);

function badgeStyle(verb: string): string {
  return SENSITIVE_VERBS.has(verb)
    ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400'
    : 'bg-muted text-muted-foreground';
}

// ── Component ───────────────────────────────────────────────────────────────

export function SecurityEventsClient({ events, userMap }: SecurityEventsClientProps) {
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const actionTypes = useMemo(
    () => Array.from(new Set(events.map((e) => e.adminAction))).sort(),
    [events],
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return events.filter((e) => {
      if (actionFilter && e.adminAction !== actionFilter) return false;
      if (q) {
        const user = e.clerkId ? userMap[e.clerkId] : null;
        const haystack = [
          user?.email,
          user?.name,
          e.clerkId,
          e.actorId,
          e.target,
          e.adminAction,
          e.ipAddress,
          e.reason,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [events, search, actionFilter, userMap]);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="text"
            placeholder="Search by actor, target, IP, or reason..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <Select value={actionFilter || '_all'} onValueChange={(v) => setActionFilter(v === '_all' ? '' : v)}>
          <SelectTrigger className="w-[190px]">
            <SelectValue placeholder="All actions" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">All actions</SelectItem>
            {actionTypes.map((a) => (
              <SelectItem key={a} value={a}>{a}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <p className={CAPTION}>
        Showing {filtered.length} of {events.length} privileged events
      </p>

      {filtered.length === 0 ? (
        <EmptyState
          icon={ShieldAlert}
          title={events.length === 0 ? 'No privileged events yet.' : 'No matching events.'}
          description={
            events.length === 0
              ? 'Admin actions (deletes, refunds, role changes, exports) will appear here.'
              : 'Try adjusting your filters or search query.'
          }
        />
      ) : (
        <div className={cn(SURFACE_CARD, 'overflow-hidden')}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/60 bg-muted/40">
                  <th className={cn('text-left px-4 py-2.5 whitespace-nowrap', SECTION_LABEL)}>Timestamp</th>
                  <th className={cn('text-left px-4 py-2.5 whitespace-nowrap', SECTION_LABEL)}>Actor</th>
                  <th className={cn('text-left px-4 py-2.5 whitespace-nowrap', SECTION_LABEL)}>IP address</th>
                  <th className={cn('text-left px-4 py-2.5 whitespace-nowrap', SECTION_LABEL)}>Action</th>
                  <th className={cn('text-left px-4 py-2.5 whitespace-nowrap', SECTION_LABEL)}>Target</th>
                  <th className={cn('text-left px-4 py-2.5 whitespace-nowrap', SECTION_LABEL)}>Reason</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filtered.map((e) => {
                  const user = e.clerkId ? userMap[e.clerkId] : null;
                  const isExpanded = expandedRow === e.id;
                  return (
                    <Fragment key={e.id}>
                      <tr
                        className="hover:bg-muted/30 transition-colors cursor-pointer"
                        onClick={() => setExpandedRow(isExpanded ? null : e.id)}
                      >
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <span title={formatAbsolute(e.createdAt)}>{timeAgo(e.createdAt)}</span>
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          {user ? (
                            <div className="min-w-0">
                              {user.name && (
                                <span className="font-medium text-foreground">{user.name}</span>
                              )}
                              <span
                                className={
                                  user.name
                                    ? ' text-muted-foreground text-xs ml-1.5'
                                    : 'text-foreground'
                                }
                              >
                                {user.email}
                              </span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-xs">
                              {e.clerkId ? e.clerkId.slice(0, 12) + '...' : 'System'}
                            </span>
                          )}
                          <div className="text-[10px] text-muted-foreground/70 font-mono mt-0.5">
                            {e.clerkId ?? '—'}
                            {e.actorId ? ` · ${e.actorId.slice(0, 8)}` : ''}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground text-xs font-mono">
                          {e.ipAddress ?? '-'}
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <span
                            className={`inline-flex text-[11px] font-semibold rounded-full px-2 py-0.5 ${badgeStyle(e.adminAction)}`}
                          >
                            {e.adminAction}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground text-xs font-mono">
                          {e.target
                            ? e.target.length > 16
                              ? e.target.slice(0, 16) + '...'
                              : e.target
                            : '-'}
                        </td>
                        <td className="px-4 py-2.5 max-w-[220px] truncate text-xs text-foreground/80" title={e.reason ?? undefined}>
                          {e.reason ?? '—'}
                        </td>
                        <td className="px-4 py-2.5">
                          {e.metadata ? (
                            isExpanded ? (
                              <ChevronDown size={14} className="text-muted-foreground" />
                            ) : (
                              <ChevronRight size={14} className="text-muted-foreground" />
                            )
                          ) : null}
                        </td>
                      </tr>
                      {isExpanded && e.metadata && (
                        <tr>
                          <td colSpan={7} className="px-4 py-3 bg-muted/20">
                            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-1.5">
                              Metadata
                            </p>
                            <pre className="text-xs font-mono text-foreground bg-muted/40 rounded-lg p-3 overflow-x-auto max-h-64">
                              {JSON.stringify(e.metadata, null, 2)}
                            </pre>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
