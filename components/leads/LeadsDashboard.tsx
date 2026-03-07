'use client';

import { useState } from 'react';
import {
  PhoneCall,
  UserPlus,
  RefreshCw,
  PhoneIncoming,
  Loader2
} from 'lucide-react';

import { useLeads } from '@/hooks/useLeads';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { LeadRow } from '@/lib/types';

// ─── Relative time helper ─────────────────────────────────────────────────────

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ─── Score badge ──────────────────────────────────────────────────────────────

function ScoreBadge({ score }: { score: LeadRow['score'] }) {
  const config = {
    HOT: { label: 'Hot', className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 border-red-200' },
    WARM: { label: 'Warm', className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200' },
    COLD: { label: 'Cold', className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200' }
  } as const;

  const { label, className } = config[score];
  return <Badge className={className}>{label}</Badge>;
}

// ─── Intent badge ─────────────────────────────────────────────────────────────

function IntentBadge({ intent }: { intent: LeadRow['intent'] }) {
  if (intent === 'UNKNOWN') return <span className="text-muted-foreground text-sm">—</span>;
  return (
    <Badge variant="outline" className="capitalize">
      {intent.charAt(0) + intent.slice(1).toLowerCase()}
    </Badge>
  );
}

// ─── Transcript dialog ────────────────────────────────────────────────────────

function TranscriptDialog({ lead }: { lead: LeadRow }) {
  if (!lead.transcript && !lead.transcriptSummary) {
    return <span className="text-muted-foreground text-sm">—</span>;
  }

  const preview = lead.transcriptSummary
    ? lead.transcriptSummary.slice(0, 80) + (lead.transcriptSummary.length > 80 ? '…' : '')
    : 'View transcript';

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button className="text-sm text-left text-primary underline-offset-4 hover:underline max-w-[200px] truncate block">
          {preview}
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Call Transcript — {lead.phone}</DialogTitle>
          <DialogDescription>
            {relativeTime(lead.createdAt)}
          </DialogDescription>
        </DialogHeader>
        {lead.transcriptSummary && (
          <div className="rounded-lg bg-muted p-4 mb-4">
            <p className="text-sm font-medium mb-1">Summary</p>
            <p className="text-sm text-muted-foreground">{lead.transcriptSummary}</p>
          </div>
        )}
        {lead.transcript && (
          <div className="space-y-1">
            <p className="text-sm font-medium mb-2">Full Transcript</p>
            <pre className="whitespace-pre-wrap text-sm text-muted-foreground font-mono bg-muted rounded p-4 text-xs leading-relaxed">
              {lead.transcript}
            </pre>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
        <PhoneIncoming className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold mb-2">No leads yet</h3>
      <p className="text-muted-foreground max-w-sm text-sm">
        Share your agent&apos;s phone number on Zillow, Realtor.com, or your website to start
        receiving AI-qualified leads here.
      </p>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface LeadsDashboardProps {
  subdomain: string;
}

export function LeadsDashboard({ subdomain }: LeadsDashboardProps) {
  const { data: leads, isLoading, isError, refetch, isFetching } = useLeads(subdomain);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
          <p className="text-muted-foreground">Failed to load leads. Please try again.</p>
          <Button variant="outline" onClick={() => refetch()} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {leads?.length ?? 0} lead{leads?.length !== 1 ? 's' : ''} — refreshes every 5 s
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          className="gap-2"
        >
          <RefreshCw className={cn('h-3 w-3', isFetching && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {/* Table */}
      {!leads || leads.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState />
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Phone</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Intent</TableHead>
                <TableHead>Budget</TableHead>
                <TableHead>Timeline</TableHead>
                <TableHead className="hidden lg:table-cell">Areas</TableHead>
                <TableHead>Summary</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leads.map((lead) => (
                <TableRow key={lead.id} className="hover:bg-muted/40">
                  <TableCell className="font-mono text-sm">{lead.phone}</TableCell>
                  <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                    {relativeTime(lead.createdAt)}
                  </TableCell>
                  <TableCell>
                    <ScoreBadge score={lead.score} />
                  </TableCell>
                  <TableCell>
                    <IntentBadge intent={lead.intent} />
                  </TableCell>
                  <TableCell className="text-sm">
                    {lead.budget ?? <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-sm">
                    {lead.timeline ?? <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-sm">
                    {lead.preferredAreas ?? <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="max-w-[200px]">
                    <TranscriptDialog lead={lead} />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        title="Call back"
                        onClick={() => window.open(`tel:${lead.phone}`)}
                        className="h-8 w-8 p-0"
                      >
                        <PhoneCall className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        title="Add to CRM"
                        onClick={() =>
                          window.open(
                            `/s/${subdomain}/contacts?prefill=${encodeURIComponent(lead.phone)}`,
                            '_self'
                          )
                        }
                        className="h-8 w-8 p-0"
                      >
                        <UserPlus className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
