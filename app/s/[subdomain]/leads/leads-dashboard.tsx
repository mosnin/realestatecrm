'use client';

import { useCallback } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  Phone,
  UserPlus,
  Eye,
  Flame,
  ThermometerSun,
  Snowflake,
  PhoneIncoming,
} from 'lucide-react';
import { useRealtimeLeads } from '@/hooks/use-realtime-leads';
import type { Lead } from '@/lib/types/vapi';

interface LeadsDashboardProps {
  spaceId: string;
  initialLeads: Lead[];
}

const scoreConfig = {
  HOT: {
    label: 'Hot',
    icon: Flame,
    className: 'bg-red-500/10 text-red-600 border-red-500/20',
  },
  WARM: {
    label: 'Warm',
    icon: ThermometerSun,
    className: 'bg-orange-500/10 text-orange-600 border-orange-500/20',
  },
  COLD: {
    label: 'Cold',
    icon: Snowflake,
    className: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  },
};

const intentLabels: Record<string, string> = {
  BUYER: 'Buyer',
  SELLER: 'Seller',
  BOTH: 'Buyer & Seller',
};

function formatRelativeTime(dateStr: string | Date) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

function formatPhoneNumber(phone: string) {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 11 && cleaned.startsWith('1')) {
    return `(${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
  }
  return phone;
}

export function LeadsDashboard({
  spaceId,
  initialLeads,
}: LeadsDashboardProps) {
  const handleNewLead = useCallback((newLead: Lead) => {
    const score = scoreConfig[newLead.score];
    toast.success(`New ${score.label} Lead!`, {
      description: `${formatPhoneNumber(newLead.phone)}${newLead.budget ? ` - Budget: ${newLead.budget}` : ''}`,
    });
  }, []);

  const leads = useRealtimeLeads({ spaceId, initialLeads, onNewLead: handleNewLead });

  if (leads.length === 0) {
    return <EmptyState />;
  }

  return (
    <>
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard
          label="Total Leads"
          value={leads.length}
          icon={PhoneIncoming}
        />
        <SummaryCard
          label="Hot Leads"
          value={leads.filter((l) => l.score === 'HOT').length}
          icon={Flame}
          className="text-red-600"
        />
        <SummaryCard
          label="Warm Leads"
          value={leads.filter((l) => l.score === 'WARM').length}
          icon={ThermometerSun}
          className="text-orange-600"
        />
        <SummaryCard
          label="Buyers"
          value={
            leads.filter(
              (l) => l.intent === 'BUYER' || l.intent === 'BOTH'
            ).length
          }
          icon={UserPlus}
        />
      </div>

      {/* Desktop table */}
      <div className="hidden md:block">
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Phone</TableHead>
                  <TableHead>When</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Intent</TableHead>
                  <TableHead>Budget</TableHead>
                  <TableHead>Timeline</TableHead>
                  <TableHead>Areas</TableHead>
                  <TableHead>Transcript</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leads.map((lead) => (
                  <LeadTableRow key={lead.id} lead={lead} />
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {leads.map((lead) => (
          <LeadCard key={lead.id} lead={lead} />
        ))}
      </div>
    </>
  );
}

function SummaryCard({
  label,
  value,
  icon: Icon,
  className,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  className?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold">{value}</p>
          </div>
          <Icon size={24} className={className ?? 'text-muted-foreground'} />
        </div>
      </CardContent>
    </Card>
  );
}

function ScoreBadge({ score }: { score: Lead['score'] }) {
  const config = scoreConfig[score];
  const Icon = config.icon;
  return (
    <Badge variant="outline" className={config.className}>
      <Icon size={12} className="mr-1" />
      {config.label}
    </Badge>
  );
}

function LeadTableRow({ lead }: { lead: Lead }) {
  return (
    <TableRow>
      <TableCell className="font-mono text-sm">
        {formatPhoneNumber(lead.phone)}
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {formatRelativeTime(lead.createdAt)}
      </TableCell>
      <TableCell>
        <ScoreBadge score={lead.score} />
      </TableCell>
      <TableCell className="text-sm">
        {lead.intent ? intentLabels[lead.intent] : '-'}
      </TableCell>
      <TableCell className="text-sm">{lead.budget ?? '-'}</TableCell>
      <TableCell className="text-sm">{lead.timeline ?? '-'}</TableCell>
      <TableCell className="text-sm max-w-[150px] truncate">
        {lead.preferredAreas.length > 0
          ? lead.preferredAreas.join(', ')
          : '-'}
      </TableCell>
      <TableCell>
        {lead.transcriptSummary ? (
          <TranscriptDialog lead={lead} />
        ) : (
          <span className="text-xs text-muted-foreground">N/A</span>
        )}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              window.location.href = `tel:${lead.phone}`;
            }}
            title="Call back"
          >
            <Phone size={14} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              toast.success('Lead added to CRM contacts');
            }}
            title="Add to CRM"
          >
            <UserPlus size={14} />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

function LeadCard({ lead }: { lead: Lead }) {
  return (
    <Card>
      <CardContent className="pt-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="font-mono text-sm font-medium">
            {formatPhoneNumber(lead.phone)}
          </span>
          <ScoreBadge score={lead.score} />
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <span className="text-muted-foreground">Intent: </span>
            {lead.intent ? intentLabels[lead.intent] : '-'}
          </div>
          <div>
            <span className="text-muted-foreground">Budget: </span>
            {lead.budget ?? '-'}
          </div>
          <div>
            <span className="text-muted-foreground">Timeline: </span>
            {lead.timeline ?? '-'}
          </div>
          <div>
            <span className="text-muted-foreground">When: </span>
            {formatRelativeTime(lead.createdAt)}
          </div>
        </div>
        {lead.preferredAreas.length > 0 && (
          <p className="text-sm">
            <span className="text-muted-foreground">Areas: </span>
            {lead.preferredAreas.join(', ')}
          </p>
        )}
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => {
              window.location.href = `tel:${lead.phone}`;
            }}
          >
            <Phone size={14} className="mr-1" />
            Call Back
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => toast.success('Lead added to CRM contacts')}
          >
            <UserPlus size={14} className="mr-1" />
            Add to CRM
          </Button>
          {lead.transcriptSummary && <TranscriptDialog lead={lead} />}
        </div>
      </CardContent>
    </Card>
  );
}

function TranscriptDialog({ lead }: { lead: Lead }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Eye size={14} className="mr-1" />
          <span className="hidden md:inline">View</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Call Transcript - {formatPhoneNumber(lead.phone)}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-muted-foreground">Score: </span>
              <ScoreBadge score={lead.score} />
            </div>
            <div>
              <span className="text-muted-foreground">Intent: </span>
              {lead.intent ? intentLabels[lead.intent] : 'Unknown'}
            </div>
            <div>
              <span className="text-muted-foreground">Budget: </span>
              {lead.budget ?? 'Not disclosed'}
            </div>
            <div>
              <span className="text-muted-foreground">Duration: </span>
              {lead.callDuration
                ? `${Math.floor(lead.callDuration / 60)}m ${lead.callDuration % 60}s`
                : 'Unknown'}
            </div>
          </div>

          {lead.transcriptSummary && (
            <div>
              <h4 className="font-medium text-sm mb-2">Summary</h4>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap bg-muted/50 rounded-lg p-3">
                {lead.transcriptSummary}
              </p>
            </div>
          )}

          {lead.transcript && (
            <div>
              <h4 className="font-medium text-sm mb-2">Full Transcript</h4>
              <pre className="text-xs text-muted-foreground whitespace-pre-wrap bg-muted/50 rounded-lg p-3 max-h-[300px] overflow-y-auto">
                {lead.transcript}
              </pre>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EmptyState() {
  return (
    <Card>
      <CardHeader className="text-center py-12">
        <PhoneIncoming
          size={48}
          className="mx-auto text-muted-foreground mb-4"
        />
        <CardTitle>No leads yet</CardTitle>
        <CardDescription className="max-w-sm mx-auto">
          Share your AI agent's phone number on Zillow, Realtor.com, or your
          website to start receiving qualified leads automatically.
        </CardDescription>
      </CardHeader>
    </Card>
  );
}
