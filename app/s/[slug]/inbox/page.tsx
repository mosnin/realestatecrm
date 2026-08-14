/**
 * /s/[slug]/inbox — the Unified Inbox.
 *
 * One thread per client, interleaving every channel (email / sms / portal /
 * note) into a single transcript. Reads the InboxThread / InboxMessage tables
 * that the capture + send paths write through lib/inbox.ts — the same rollup
 * the Brief's "clients waiting" signal counts.
 *
 * Left rail: the space's threads, most-recently-active first, with an unread
 * badge and a one-line preview. Right pane: the selected thread's messages in
 * order, plus an inline "Draft reply" that reuses the existing Chippi quick-
 * draft path (no new drafting engine). Thread selection is a plain ?t= link so
 * the server refetches the transcript — the only client island is the reply.
 *
 * Every read is scoped by the authenticated space id — the .eq('spaceId') IS
 * the tenant boundary under the service-role client.
 */

import { notFound, redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import Link from 'next/link';
import { Mail, MessageSquare, Globe, StickyNote } from 'lucide-react';
import { getSpaceFromSlug } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { TITLE_FONT, BODY_MUTED, SECTION_LABEL } from '@/lib/typography';
import { Reveal, SplitReveal, StaggerReveal } from '@/components/motion';
import { DraftReply } from '@/components/inbox/draft-reply';
import type { InboxChannel, InboxDirection } from '@/lib/types';

export const dynamic = 'force-dynamic';

interface ThreadRow {
  id: string;
  contactId: string;
  lastMessageAt: string;
  lastDirection: InboxDirection | null;
  unreadCount: number;
}

interface MessageRow {
  id: string;
  threadId: string;
  direction: InboxDirection;
  channel: InboxChannel;
  subject: string | null;
  body: string;
  createdAt: string;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const CHANNEL_ICON: Record<InboxChannel, React.ComponentType<{ size?: number; className?: string }>> = {
  email: Mail,
  sms: MessageSquare,
  portal: Globe,
  note: StickyNote,
};

const CHANNEL_LABEL: Record<InboxChannel, string> = {
  email: 'Email',
  sms: 'SMS',
  portal: 'Portal',
  note: 'Note',
};

export default async function InboxPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { slug } = await params;
  const { t: requestedThreadId } = await searchParams;
  const { userId } = await auth();
  if (!userId) redirect('/login/realtor');

  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  // Confirm the authed user owns this space before any tenant read.
  const { data: spaceOwner } = await supabase
    .from('User')
    .select('id')
    .eq('clerkId', userId)
    .eq('id', space.ownerId)
    .maybeSingle();
  if (!spaceOwner) notFound();

  // Threads for this space, most-recently-active first.
  const { data: threadData } = await supabase
    .from('InboxThread')
    .select('id, contactId, lastMessageAt, lastDirection, unreadCount')
    .eq('spaceId', space.id)
    .order('lastMessageAt', { ascending: false })
    .limit(100);
  const threads = (threadData ?? []) as ThreadRow[];

  // Contact names, and recent messages for the per-thread preview line. Both
  // scoped to this space; the message read is bounded and yields the newest
  // message per thread (first hit wins) for the list snippet + channel icon.
  const contactIds = [...new Set(threads.map((t) => t.contactId))];
  const [{ data: contactData }, { data: previewData }] = await Promise.all([
    contactIds.length > 0
      ? supabase.from('Contact').select('id, name').eq('spaceId', space.id).in('id', contactIds)
      : Promise.resolve({ data: [] as { id: string; name: string | null }[] }),
    supabase
      .from('InboxMessage')
      .select('id, threadId, direction, channel, subject, body, createdAt')
      .eq('spaceId', space.id)
      .order('createdAt', { ascending: false })
      .limit(300),
  ]);

  const nameById = new Map(
    ((contactData ?? []) as { id: string; name: string | null }[]).map((c) => [c.id, c.name]),
  );
  const previewByThread = new Map<string, MessageRow>();
  for (const m of (previewData ?? []) as MessageRow[]) {
    if (!previewByThread.has(m.threadId)) previewByThread.set(m.threadId, m);
  }

  // The selected thread: the requested one (when it belongs to this space) or
  // the most-recently-active. Its full transcript loads in chronological order.
  const selected =
    threads.find((t) => t.id === requestedThreadId) ?? threads[0] ?? null;

  let messages: MessageRow[] = [];
  if (selected) {
    const { data: msgData } = await supabase
      .from('InboxMessage')
      .select('id, threadId, direction, channel, subject, body, createdAt')
      .eq('spaceId', space.id)
      .eq('threadId', selected.id)
      .order('createdAt', { ascending: true })
      .limit(200);
    messages = (msgData ?? []) as MessageRow[];
  }

  const selectedName = selected ? nameById.get(selected.contactId) ?? 'Unknown contact' : null;
  const unreadTotal = threads.reduce((sum, thread) => sum + thread.unreadCount, 0);

  return (
    <div data-realtor-page="today" data-page-family="unified-inbox" className="chippi-dashboard-canvas mx-auto min-h-[calc(100vh-10rem)] w-full max-w-6xl space-y-8 pb-12 pt-3 sm:pt-5">
      <header className="grid gap-8 border-b border-border/60 pb-9 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-end lg:gap-16">
        <div className="max-w-3xl space-y-3">
          <p className={SECTION_LABEL}>Unified client inbox</p>
          <h1 className="text-[3rem] leading-[.96] tracking-[-0.045em] sm:text-[4.5rem]" style={TITLE_FONT}>
            <SplitReveal as="span" text="Never lose the thread." />
          </h1>
          <p className={BODY_MUTED}>Email, text, portal notes, and the next reply—one continuous client conversation.</p>
        </div>
        <div className="flex items-end gap-3 lg:justify-end">
          <span className="text-[5rem] leading-[.78] tracking-[-0.06em] tabular-nums" style={TITLE_FONT}>{unreadTotal}</span>
          <span className="pb-1.5 text-sm text-muted-foreground">unread</span>
        </div>
      </header>

      {threads.length === 0 ? (
        <Reveal variant="fade">
          <div className="border-y border-border/60">
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <p className="mt-3 text-base text-foreground">No conversations yet.</p>
              <p className={cn(BODY_MUTED, 'mt-1 max-w-xs')}>
                When a client emails, texts, or messages you, the whole thread lands here — every
                channel in one place.
              </p>
            </div>
          </div>
        </Reveal>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[20rem_1fr]">
          {/* ── Thread list ─────────────────────────────────────────────── */}
          <div className="overflow-hidden border-y border-border/60">
            <StaggerReveal as="ul" className="divide-y divide-border/60">
              {threads.map((thread) => {
                const name = nameById.get(thread.contactId) ?? 'Unknown contact';
                const preview = previewByThread.get(thread.id);
                const isSelected = selected?.id === thread.id;
                const PreviewIcon = preview ? CHANNEL_ICON[preview.channel] : null;
                return (
                  <li key={thread.id}>
                    <Link
                      href={`/s/${slug}/inbox?t=${thread.id}`}
                      className={cn(
                        'flex items-start gap-3 px-4 py-3.5 transition-colors',
                        isSelected ? 'bg-foreground/[0.05]' : 'hover:bg-foreground/[0.03]',
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p
                            className={cn(
                              'truncate text-sm',
                              thread.unreadCount > 0 ? 'font-semibold text-foreground' : 'text-foreground',
                            )}
                          >
                            {name}
                          </p>
                          {PreviewIcon && (
                            <PreviewIcon size={12} className="shrink-0 text-muted-foreground/60" />
                          )}
                        </div>
                        <p className={cn(BODY_MUTED, 'mt-0.5 truncate text-xs')}>
                          {preview
                            ? `${preview.direction === 'outbound' ? 'You: ' : ''}${preview.body}`
                            : 'No messages yet'}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <span className="text-[11px] tabular-nums text-muted-foreground/70">
                          {relativeTime(thread.lastMessageAt)}
                        </span>
                        {thread.unreadCount > 0 && (
                          <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-foreground px-1.5 text-[11px] font-semibold tabular-nums text-background">
                            {thread.unreadCount}
                          </span>
                        )}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </StaggerReveal>
          </div>

          {/* ── Thread view ─────────────────────────────────────────────── */}
          <section className="chippi-dashboard-panel flex min-h-[480px] flex-col rounded-[1.75rem] p-6 sm:p-8">
            {selected && (
              <>
                <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-4">
                  <div className="min-w-0">
                    <h2 className="truncate text-lg font-semibold tracking-tight text-foreground">
                      {selectedName}
                    </h2>
                    {selected.unreadCount > 0 && (
                      <p className={cn(BODY_MUTED, 'text-xs')}>
                        {selected.unreadCount} unread {selected.unreadCount === 1 ? 'reply' : 'replies'}
                      </p>
                    )}
                  </div>
                  {selectedName && (
                    <DraftReply slug={slug} contactId={selected.contactId} contactName={selectedName} />
                  )}
                </div>

                <div className="flex-1 space-y-4 py-4">
                  {messages.length === 0 ? (
                    <p className={cn(BODY_MUTED, 'py-8 text-center')}>No messages on this thread yet.</p>
                  ) : (
                    messages.map((m) => {
                      const Icon = CHANNEL_ICON[m.channel];
                      const outbound = m.direction === 'outbound';
                      return (
                        <div
                          key={m.id}
                          className={cn('flex flex-col gap-1', outbound ? 'items-end' : 'items-start')}
                        >
                          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/70">
                            <Icon size={11} />
                            <span>{CHANNEL_LABEL[m.channel]}</span>
                            <span aria-hidden>·</span>
                            <span>{outbound ? 'You' : selectedName}</span>
                            <span aria-hidden>·</span>
                            <span className="tabular-nums">{relativeTime(m.createdAt)}</span>
                          </div>
                          <div
                            className={cn(
                              'max-w-[85%] rounded-2xl px-4 py-2.5 text-sm',
                              outbound
                                ? 'bg-foreground text-background'
                                : 'chippi-dashboard-panel-muted text-foreground',
                            )}
                          >
                            {m.subject && m.channel === 'email' && (
                              <p className={cn('mb-1 font-semibold', outbound ? 'text-white' : 'text-foreground')}>
                                {m.subject}
                              </p>
                            )}
                            <p className="whitespace-pre-wrap break-words">{m.body}</p>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
