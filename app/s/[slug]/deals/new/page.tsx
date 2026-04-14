'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, Search, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import type { DealStage } from '@/lib/types';

// ── Schema (mirrors deal-form.tsx + adds status) ──────────────────────────────
const schema = z.object({
  title: z.string().min(1, 'Title is required'),
  stageId: z.string().min(1, 'Stage is required'),
  status: z.enum(['active', 'won', 'lost', 'on_hold']),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  value: z.string().optional(),
  commissionRate: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? null : Number(v)),
    z.number().min(0).max(100).nullable(),
  ),
  probability: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? null : Number(v)),
    z.number().int().min(0).max(100).nullable(),
  ),
  address: z.string().optional(),
  closeDate: z.string().optional(),
  description: z.string().optional(),
  contactIds: z.array(z.string()).optional(),
});

type FormData = z.infer<typeof schema>;

type ContactResult = { id: string; name: string; email: string | null };

// ── Page ──────────────────────────────────────────────────────────────────────
export default function NewDealPage() {
  const router = useRouter();
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const searchParams = useSearchParams();
  const preselectedStageId = searchParams.get('stageId') ?? '';

  const [stages, setStages] = useState<DealStage[]>([]);
  const [stagesLoading, setStagesLoading] = useState(true);

  // Contact search state
  const [contactQuery, setContactQuery] = useState('');
  const [contactResults, setContactResults] = useState<ContactResult[]>([]);
  const [contactsSearching, setContactsSearching] = useState(false);
  const [selectedContacts, setSelectedContacts] = useState<ContactResult[]>([]);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      priority: 'MEDIUM',
      status: 'active',
      contactIds: [],
      stageId: preselectedStageId,
    },
  });

  const stageId = watch('stageId');
  const priority = watch('priority');
  const status = watch('status');

  // ── Fetch stages once ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!slug) return;
    setStagesLoading(true);
    fetch(`/api/stages?slug=${slug}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: DealStage[]) => {
        setStages(data);
        // Pre-select: honour URL param first, then fall back to first stage
        if (preselectedStageId && data.some((s) => s.id === preselectedStageId)) {
          setValue('stageId', preselectedStageId);
        } else if (!preselectedStageId && data.length > 0) {
          setValue('stageId', data[0].id);
        }
      })
      .catch(() => {/* non-fatal */})
      .finally(() => setStagesLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  // ── Contact search (debounced) ─────────────────────────────────────────────
  const searchContacts = useCallback(
    async (q: string) => {
      if (!q.trim()) {
        setContactResults([]);
        return;
      }
      setContactsSearching(true);
      try {
        const res = await fetch(
          `/api/contacts?slug=${encodeURIComponent(slug)}&search=${encodeURIComponent(q)}`,
        );
        if (res.ok) {
          const data = await res.json();
          // API returns an array of contacts
          setContactResults(
            (Array.isArray(data) ? data : data.contacts ?? []).slice(0, 20),
          );
        }
      } catch {
        // ignore
      } finally {
        setContactsSearching(false);
      }
    },
    [slug],
  );

  useEffect(() => {
    const t = setTimeout(() => searchContacts(contactQuery), 300);
    return () => clearTimeout(t);
  }, [contactQuery, searchContacts]);

  function toggleContact(contact: ContactResult) {
    setSelectedContacts((prev) => {
      const alreadySelected = prev.some((c) => c.id === contact.id);
      const next = alreadySelected
        ? prev.filter((c) => c.id !== contact.id)
        : [...prev, contact];
      setValue(
        'contactIds',
        next.map((c) => c.id),
      );
      return next;
    });
  }

  function removeContact(id: string) {
    setSelectedContacts((prev) => {
      const next = prev.filter((c) => c.id !== id);
      setValue(
        'contactIds',
        next.map((c) => c.id),
      );
      return next;
    });
  }

  // ── Form submission ────────────────────────────────────────────────────────
  async function onSubmit(data: FormData) {
    const res = await fetch('/api/deals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug,
        title: data.title,
        description: data.description || undefined,
        value: data.value || undefined,
        commissionRate: data.commissionRate ?? undefined,
        probability: data.probability ?? undefined,
        address: data.address || undefined,
        priority: data.priority,
        closeDate: data.closeDate || undefined,
        stageId: data.stageId,
        contactIds: data.contactIds ?? [],
        // status is not a POST field in the API (defaults to active); included
        // for completeness — the API will ignore unknown fields gracefully.
        status: data.status,
      }),
    });

    if (!res.ok) {
      // Surface API error without crashing
      const body = await res.json().catch(() => ({}));
      throw new Error((body as { error?: string }).error ?? 'Failed to create deal');
    }

    router.push(`/s/${slug}/deals`);
  }

  const backHref = `/s/${slug}/deals`;

  return (
    <div className="flex flex-col min-h-[calc(100vh-4rem)] max-w-2xl mx-auto px-4 py-6 gap-0">
      {/* ── Top bar ── */}
      <div className="flex items-center gap-3 mb-6">
        <button
          type="button"
          onClick={() => router.push(backHref)}
          aria-label="Back to deals"
          className="h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors flex-shrink-0"
        >
          <ArrowLeft size={18} />
        </button>
        <h1 className="text-xl font-semibold leading-tight">New Deal</h1>
      </div>

      {/* ── Tabbed form ── */}
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="flex flex-col flex-1 gap-0"
        noValidate
      >
        <Tabs defaultValue="details" className="flex-1 flex flex-col gap-0">
          <TabsList variant="line" className="w-full justify-start border-b border-border rounded-none pb-0 mb-0 h-auto gap-0">
            <TabsTrigger value="details" className="rounded-none border-b-2 border-transparent data-[state=active]:border-foreground pb-3 px-4">
              Details
            </TabsTrigger>
            <TabsTrigger value="contacts" className="rounded-none border-b-2 border-transparent data-[state=active]:border-foreground pb-3 px-4">
              Contacts
            </TabsTrigger>
            <TabsTrigger value="notes" className="rounded-none border-b-2 border-transparent data-[state=active]:border-foreground pb-3 px-4">
              Notes
            </TabsTrigger>
          </TabsList>

          {/* ── Details tab ── */}
          <TabsContent value="details" className="mt-6 space-y-5">
            {/* Title */}
            <div className="space-y-1.5">
              <Label htmlFor="title">
                Title <span className="text-destructive">*</span>
              </Label>
              <Input
                id="title"
                placeholder="e.g. 123 Maple St – Rental"
                {...register('title')}
                aria-invalid={!!errors.title}
              />
              {errors.title && (
                <p className="text-xs text-destructive">{errors.title.message}</p>
              )}
            </div>

            {/* Stage */}
            <div className="space-y-1.5">
              <Label>
                Stage <span className="text-destructive">*</span>
              </Label>
              {stagesLoading ? (
                <div className="h-9 rounded-md border border-input bg-muted/40 animate-pulse" />
              ) : (
                <Select
                  value={stageId}
                  onValueChange={(v) => setValue('stageId', v, { shouldValidate: true })}
                >
                  <SelectTrigger aria-invalid={!!errors.stageId}>
                    <SelectValue placeholder="Select a stage" />
                  </SelectTrigger>
                  <SelectContent>
                    {stages.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        <span className="flex items-center gap-2">
                          <span
                            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                            style={{ backgroundColor: s.color }}
                          />
                          {s.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {errors.stageId && (
                <p className="text-xs text-destructive">{errors.stageId.message}</p>
              )}
            </div>

            {/* Status */}
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select
                value={status}
                onValueChange={(v) => setValue('status', v as FormData['status'])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="won">Won</SelectItem>
                  <SelectItem value="lost">Lost</SelectItem>
                  <SelectItem value="on_hold">On Hold</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Priority */}
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select
                value={priority}
                onValueChange={(v) => setValue('priority', v as FormData['priority'])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="LOW">Low</SelectItem>
                  <SelectItem value="MEDIUM">Medium</SelectItem>
                  <SelectItem value="HIGH">High</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Two-column numeric fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="value">Deal Value ($)</Label>
                <Input
                  id="value"
                  type="number"
                  min={0}
                  step={1000}
                  placeholder="e.g. 500000"
                  {...register('value')}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="commissionRate">Commission Rate (%)</Label>
                <Input
                  id="commissionRate"
                  type="number"
                  min={0}
                  max={100}
                  step={0.1}
                  placeholder="e.g. 2.5"
                  {...register('commissionRate')}
                  aria-invalid={!!errors.commissionRate}
                />
                {errors.commissionRate && (
                  <p className="text-xs text-destructive">{errors.commissionRate.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="probability">Close Probability (%)</Label>
                <Input
                  id="probability"
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  placeholder="e.g. 75"
                  {...register('probability')}
                  aria-invalid={!!errors.probability}
                />
                {errors.probability && (
                  <p className="text-xs text-destructive">{errors.probability.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="closeDate">Expected Close Date</Label>
                <Input id="closeDate" type="date" {...register('closeDate')} />
              </div>
            </div>

            {/* Property address */}
            <div className="space-y-1.5">
              <Label htmlFor="address">Property Address</Label>
              <Input
                id="address"
                placeholder="e.g. 456 Oak Ave, Toronto, ON"
                {...register('address')}
              />
            </div>
          </TabsContent>

          {/* ── Contacts tab ── */}
          <TabsContent value="contacts" className="mt-6 space-y-4">
            {/* Selected contacts */}
            {selectedContacts.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Linked ({selectedContacts.length})
                </p>
                <div className="rounded-lg border border-border divide-y overflow-hidden">
                  {selectedContacts.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between gap-3 px-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{c.name}</p>
                        {c.email && (
                          <p className="text-xs text-muted-foreground truncate">{c.email}</p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => removeContact(c.id)}
                        className="h-6 w-6 flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 flex-shrink-0 transition-colors"
                        aria-label={`Remove ${c.name}`}
                      >
                        <X size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Search */}
            <div className="space-y-1.5">
              <Label htmlFor="contact-search">Search Contacts</Label>
              <div className="relative">
                <Search
                  size={14}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
                />
                <Input
                  id="contact-search"
                  value={contactQuery}
                  onChange={(e) => setContactQuery(e.target.value)}
                  placeholder="Type a name or email…"
                  className="pl-8 pr-8"
                />
                {contactQuery && (
                  <button
                    type="button"
                    onClick={() => { setContactQuery(''); setContactResults([]); }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label="Clear search"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
            </div>

            {/* Results */}
            {contactsSearching ? (
              <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                <Loader2 size={14} className="animate-spin" />
                Searching…
              </div>
            ) : contactResults.length > 0 ? (
              <div className="rounded-lg border border-border divide-y overflow-hidden">
                {contactResults.map((c) => {
                  const isSelected = selectedContacts.some((s) => s.id === c.id);
                  return (
                    <label
                      key={c.id}
                      className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-muted/50 transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleContact(c)}
                        className="rounded accent-primary"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{c.name}</p>
                        {c.email && (
                          <p className="text-xs text-muted-foreground truncate">{c.email}</p>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>
            ) : contactQuery.trim() ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No contacts found for &ldquo;{contactQuery}&rdquo;
              </p>
            ) : (
              <p className="text-sm text-muted-foreground py-4 text-center">
                Search for contacts above to link them to this deal
              </p>
            )}
          </TabsContent>

          {/* ── Notes tab ── */}
          <TabsContent value="notes" className="mt-6 space-y-1.5">
            <Label htmlFor="description">Description / Notes</Label>
            <Textarea
              id="description"
              rows={8}
              placeholder="Add context, notes, or a description for this deal…"
              {...register('description')}
            />
          </TabsContent>
        </Tabs>

        {/* ── Footer (always visible) ── */}
        <div className="mt-8 flex items-center justify-between gap-3 border-t border-border pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push(backHref)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting} className="min-w-[120px]">
            {isSubmitting ? (
              <span className="flex items-center gap-2">
                <Loader2 size={14} className="animate-spin" />
                Creating…
              </span>
            ) : (
              'Create Deal'
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
