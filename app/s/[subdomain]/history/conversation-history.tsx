'use client';

import { useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Phone,
  PhoneIncoming,
  PhoneOutgoing,
  MessageSquare,
  Eye,
  Search,
  Loader2,
  History,
  Play,
} from 'lucide-react';
import { toast } from 'sonner';
import type { Conversation, VapiMessage } from '@/lib/types/vapi';

interface ConversationHistoryProps {
  spaceId: string;
  initialConversations: Conversation[];
  initialSearch?: string;
}

const typeConfig = {
  VOICE_INBOUND: {
    label: 'Inbound Call',
    icon: PhoneIncoming,
    className: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  },
  VOICE_OUTBOUND: {
    label: 'Outbound Call',
    icon: PhoneOutgoing,
    className: 'bg-purple-500/10 text-purple-600 border-purple-500/20',
  },
  SMS: {
    label: 'SMS',
    icon: MessageSquare,
    className: 'bg-green-500/10 text-green-600 border-green-500/20',
  },
};

function formatDuration(seconds: number | null): string {
  if (!seconds) return '-';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${secs}s`;
}

function formatDate(dateStr: string | Date | null): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatPhoneNumber(phone: string | null): string {
  if (!phone) return 'Unknown';
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 11 && cleaned.startsWith('1')) {
    return `(${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
  }
  return phone;
}

export function ConversationHistory({
  spaceId,
  initialConversations,
  initialSearch = '',
}: ConversationHistoryProps) {
  const [conversations] = useState(initialConversations);
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const [isSyncing, setIsSyncing] = useState(false);

  const filtered = conversations.filter((c) => {
    if (typeFilter !== 'all' && c.type !== typeFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchesPhone = c.phone?.toLowerCase().includes(q);
      const matchesSummary = c.summary?.toLowerCase().includes(q);
      const matchesTranscript = c.transcript?.toLowerCase().includes(q);
      if (!matchesPhone && !matchesSummary && !matchesTranscript) return false;
    }
    return true;
  });

  async function handleSync() {
    setIsSyncing(true);
    try {
      const res = await fetch(`/api/conversations/sync?spaceId=${spaceId}`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Sync failed');
      const data = await res.json();
      toast.success(`Synced ${data.synced} conversations`);
      window.location.reload();
    } catch {
      toast.error('Failed to sync conversations');
    } finally {
      setIsSyncing(false);
    }
  }

  if (conversations.length === 0) {
    return (
      <Card>
        <CardHeader className="text-center py-12">
          <History size={48} className="mx-auto text-muted-foreground mb-4" />
          <CardTitle>No conversations yet</CardTitle>
          <CardDescription className="max-w-sm mx-auto">
            Once your AI agent starts handling calls and SMS, transcripts will
            appear here automatically.
          </CardDescription>
          <Button
            variant="outline"
            className="mt-4 mx-auto"
            onClick={handleSync}
            disabled={isSyncing}
          >
            {isSyncing ? (
              <Loader2 size={14} className="mr-2 animate-spin" />
            ) : null}
            Sync from Vapi
          </Button>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            placeholder="Search by phone, summary, or transcript..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Filter by type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="VOICE_INBOUND">Inbound Calls</SelectItem>
            <SelectItem value="VOICE_OUTBOUND">Outbound Calls</SelectItem>
            <SelectItem value="SMS">SMS</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="default"
          onClick={handleSync}
          disabled={isSyncing}
        >
          {isSyncing ? (
            <Loader2 size={14} className="mr-2 animate-spin" />
          ) : null}
          Sync
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        {filtered.length} conversation{filtered.length !== 1 ? 's' : ''}
      </p>

      {/* Desktop table */}
      <div className="hidden md:block">
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Summary</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((conv) => (
                  <ConversationTableRow key={conv.id} conversation={conv} />
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {filtered.map((conv) => (
          <ConversationCard key={conv.id} conversation={conv} />
        ))}
      </div>
    </div>
  );
}

function TypeBadge({ type }: { type: Conversation['type'] }) {
  const config = typeConfig[type];
  const Icon = config.icon;
  return (
    <Badge variant="outline" className={config.className}>
      <Icon size={12} className="mr-1" />
      {config.label}
    </Badge>
  );
}

function ConversationTableRow({
  conversation: conv,
}: {
  conversation: Conversation;
}) {
  return (
    <TableRow>
      <TableCell className="text-sm">
        {formatDate(conv.startedAt ?? conv.createdAt)}
      </TableCell>
      <TableCell>
        <TypeBadge type={conv.type} />
      </TableCell>
      <TableCell className="font-mono text-sm">
        {formatPhoneNumber(conv.phone)}
      </TableCell>
      <TableCell className="text-sm">
        {formatDuration(conv.durationSeconds)}
      </TableCell>
      <TableCell>
        <Badge variant="secondary" className="text-xs capitalize">
          {conv.status}
        </Badge>
      </TableCell>
      <TableCell className="text-sm max-w-[200px] truncate">
        {conv.summary ?? '-'}
      </TableCell>
      <TableCell className="text-right">
        <TranscriptDialog conversation={conv} />
      </TableCell>
    </TableRow>
  );
}

function ConversationCard({
  conversation: conv,
}: {
  conversation: Conversation;
}) {
  return (
    <Card>
      <CardContent className="pt-4 space-y-3">
        <div className="flex items-center justify-between">
          <TypeBadge type={conv.type} />
          <span className="text-xs text-muted-foreground">
            {formatDate(conv.startedAt ?? conv.createdAt)}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <span className="text-muted-foreground">Phone: </span>
            <span className="font-mono">
              {formatPhoneNumber(conv.phone)}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">Duration: </span>
            {formatDuration(conv.durationSeconds)}
          </div>
        </div>
        {conv.summary && (
          <p className="text-sm text-muted-foreground line-clamp-2">
            {conv.summary}
          </p>
        )}
        <TranscriptDialog conversation={conv} />
      </CardContent>
    </Card>
  );
}

function TranscriptDialog({
  conversation: conv,
}: {
  conversation: Conversation;
}) {
  const messages = (conv.messages ?? []) as VapiMessage[];

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Eye size={14} className="mr-1" />
          View
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Phone size={16} />
            {formatPhoneNumber(conv.phone)} -{' '}
            {formatDate(conv.startedAt ?? conv.createdAt)}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Meta info */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-muted-foreground">Type: </span>
              <TypeBadge type={conv.type} />
            </div>
            <div>
              <span className="text-muted-foreground">Duration: </span>
              {formatDuration(conv.durationSeconds)}
            </div>
            {conv.cost != null && (
              <div>
                <span className="text-muted-foreground">Cost: </span>$
                {conv.cost.toFixed(4)}
              </div>
            )}
            <div>
              <span className="text-muted-foreground">Status: </span>
              <Badge variant="secondary" className="text-xs capitalize">
                {conv.status}
              </Badge>
            </div>
          </div>

          {/* Recording */}
          {conv.recordingUrl && (
            <div>
              <h4 className="font-medium text-sm mb-2 flex items-center gap-1">
                <Play size={14} />
                Recording
              </h4>
              <audio
                controls
                className="w-full"
                src={conv.recordingUrl}
                preload="none"
              />
            </div>
          )}

          {/* Summary */}
          {conv.summary && (
            <div>
              <h4 className="font-medium text-sm mb-2">Summary</h4>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap bg-muted/50 rounded-lg p-3">
                {conv.summary}
              </p>
            </div>
          )}

          {/* Messages (chat-style) */}
          {messages.length > 0 ? (
            <div>
              <h4 className="font-medium text-sm mb-2">Transcript</h4>
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {messages
                  .filter((m) => m.role === 'user' || m.role === 'assistant')
                  .map((msg, i) => (
                    <div
                      key={i}
                      className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                          msg.role === 'user'
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted'
                        }`}
                      >
                        <p className="text-xs font-medium mb-0.5 opacity-70">
                          {msg.role === 'user' ? 'Caller' : 'AI Agent'}
                        </p>
                        <p>{msg.message}</p>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          ) : conv.transcript ? (
            <div>
              <h4 className="font-medium text-sm mb-2">Full Transcript</h4>
              <pre className="text-xs text-muted-foreground whitespace-pre-wrap bg-muted/50 rounded-lg p-3 max-h-[300px] overflow-y-auto">
                {conv.transcript}
              </pre>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
