'use client';

import { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, MapPin, Loader2, Pencil, Check, X, Building2, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { Property } from '@/lib/types';
import { formatPropertyAddress, formatPropertyFacts } from '@/lib/properties';

interface PropertyProfile {
  id: string;
  name: string;
  address: string | null;
  tourDuration: number;
  startHour: number;
  endHour: number;
  daysAvailable: number[];
  bufferMinutes: number;
  isActive: boolean;
  propertyId: string | null;
}

interface PropertyProfilesProps {
  slug: string;
  profiles: PropertyProfile[];
  onUpdate: (profiles: PropertyProfile[]) => void;
}

const DAYS = [
  { value: 0, label: 'Sun' },
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
];

const HOURS = Array.from({ length: 24 }, (_, i) => i);

function formatHour(h: number): string {
  if (h === 0 || h === 24) return '12 AM';
  if (h === 12) return '12 PM';
  if (h < 12) return `${h} AM`;
  return `${h - 12} PM`;
}

export function PropertyProfiles({ slug, profiles: initialProfiles, onUpdate }: PropertyProfilesProps) {
  const [profiles, setProfiles] = useState<PropertyProfile[]>(initialProfiles);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formDuration, setFormDuration] = useState(30);
  const [formStart, setFormStart] = useState(9);
  const [formEnd, setFormEnd] = useState(17);
  const [formDays, setFormDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [formBuffer, setFormBuffer] = useState(0);
  const [formError, setFormError] = useState<string | null>(null);

  // Linked listing (optional) — search + select against /api/properties,
  // same debounced pattern as the deal property picker.
  const [linkedProperty, setLinkedProperty] = useState<Property | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState('');
  const [pickerResults, setPickerResults] = useState<Property[]>([]);
  const [pickerSearching, setPickerSearching] = useState(false);
  const pickerDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!pickerOpen) return;
    if (pickerDebounce.current) clearTimeout(pickerDebounce.current);
    pickerDebounce.current = setTimeout(async () => {
      setPickerSearching(true);
      try {
        const res = await fetch(`/api/properties?slug=${encodeURIComponent(slug)}&search=${encodeURIComponent(pickerQuery)}`);
        if (res.ok) setPickerResults(await res.json());
      } catch {
        // transient — leave prior results
      } finally {
        setPickerSearching(false);
      }
    }, 200);
    return () => { if (pickerDebounce.current) clearTimeout(pickerDebounce.current); };
  }, [pickerQuery, pickerOpen, slug]);

  function resetForm() {
    setShowForm(false);
    setEditingId(null);
    setFormName('');
    setFormAddress('');
    setFormDuration(30);
    setFormStart(9);
    setFormEnd(17);
    setFormDays([1, 2, 3, 4, 5]);
    setFormBuffer(0);
    setFormError(null);
    setLinkedProperty(null);
    setPickerOpen(false);
    setPickerQuery('');
    setPickerResults([]);
  }

  function startEdit(p: PropertyProfile) {
    setEditingId(p.id);
    setFormName(p.name);
    setFormAddress(p.address || '');
    setFormDuration(p.tourDuration);
    setFormStart(p.startHour);
    setFormEnd(p.endHour);
    setFormDays(p.daysAvailable);
    setFormBuffer(p.bufferMinutes);
    setLinkedProperty(null);
    setPickerOpen(false);
    setPickerQuery('');
    setPickerResults([]);
    setShowForm(true);
    // Resolve the linked listing (if any) so it shows in the form. Best-effort
    // — a stale/removed listing just renders unlinked. Narrow the search by the
    // profile's address when present so we don't pull the whole property list.
    if (p.propertyId) {
      const q = p.address ? `&search=${encodeURIComponent(p.address)}` : '';
      fetch(`/api/properties?slug=${encodeURIComponent(slug)}${q}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          const match = Array.isArray(data) ? data.find((x: Property) => x.id === p.propertyId) : null;
          if (match) setLinkedProperty(match as Property);
        })
        .catch(() => {});
    }
  }

  function toggleDay(day: number) {
    setFormDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()
    );
  }

  function selectLinkedProperty(p: Property) {
    setLinkedProperty(p);
    setPickerOpen(false);
    setPickerQuery('');
    setPickerResults([]);
    // Pre-fill the address from the listing when the realtor hasn't typed one.
    if (!formAddress.trim()) setFormAddress(formatPropertyAddress(p));
  }

  async function handleSave() {
    if (!formName.trim()) { setFormError('Name is required'); return; }
    if (formEnd <= formStart) { setFormError('End must be after start'); return; }
    if (formDays.length === 0) { setFormError('Select at least one day'); return; }

    setSaving(true);
    setFormError(null);

    try {
      if (editingId) {
        const res = await fetch(`/api/tours/properties/${editingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: formName.trim(),
            address: formAddress.trim() || null,
            tourDuration: formDuration,
            startHour: formStart,
            endHour: formEnd,
            daysAvailable: formDays,
            bufferMinutes: formBuffer,
            propertyId: linkedProperty?.id ?? null,
          }),
        });
        if (!res.ok) throw new Error('Failed to update');
        const updated = await res.json();
        const next = profiles.map((p) => (p.id === editingId ? updated : p));
        setProfiles(next);
        onUpdate(next);
      } else {
        const res = await fetch('/api/tours/properties', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            slug,
            name: formName.trim(),
            address: formAddress.trim() || null,
            tourDuration: formDuration,
            startHour: formStart,
            endHour: formEnd,
            daysAvailable: formDays,
            bufferMinutes: formBuffer,
            propertyId: linkedProperty?.id ?? null,
          }),
        });
        if (!res.ok) throw new Error('Failed to create');
        const created = await res.json();
        const next = [...profiles, created];
        setProfiles(next);
        onUpdate(next);
      }
      resetForm();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/tours/properties/${id}`, { method: 'DELETE' });
      if (res.ok) {
        const next = profiles.filter((p) => p.id !== id);
        setProfiles(next);
        onUpdate(next);
      } else {
        setFormError('Failed to delete property');
      }
    } catch {
      setFormError("Couldn't reach the server — usually temporary.");
    } finally {
      setDeletingId(null);
    }
  }

  async function toggleActive(id: string, isActive: boolean) {
    setTogglingId(id);
    try {
      const res = await fetch(`/api/tours/properties/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive }),
      });
      if (res.ok) {
        const updated = await res.json();
        const next = profiles.map((p) => (p.id === id ? updated : p));
        setProfiles(next);
        onUpdate(next);
      } else {
        setFormError('Failed to update property status');
      }
    } catch {
      setFormError("Couldn't reach the server — usually temporary.");
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">Property Profiles</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Each property can have its own tour hours, duration, and booking link.
          </p>
        </div>
        {!showForm && (
          <Button size="sm" variant="outline" onClick={() => setShowForm(true)} className="gap-1.5">
            <Plus size={14} /> Add Property
          </Button>
        )}
      </div>

      {showForm && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Property Name *</label>
              <input type="text" value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g. Downtown Condo" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Address</label>
              <input type="text" value={formAddress} onChange={(e) => setFormAddress(e.target.value)} placeholder="123 Main St" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Duration (min)</label>
              <select value={formDuration} onChange={(e) => setFormDuration(Number(e.target.value))} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30">
                {[15, 20, 30, 45, 60, 90].map((m) => <option key={m} value={m}>{m} min</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Start Hour</label>
              <select value={formStart} onChange={(e) => setFormStart(Number(e.target.value))} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30">
                {HOURS.filter((h) => h < 23).map((h) => <option key={h} value={h}>{formatHour(h)}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">End Hour</label>
              <select value={formEnd} onChange={(e) => setFormEnd(Number(e.target.value))} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30">
                {HOURS.filter((h) => h > formStart).map((h) => <option key={h} value={h}>{formatHour(h)}</option>)}
                <option value={24}>12 AM</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Available Days</label>
            <div className="flex gap-1.5">
              {DAYS.map((d) => (
                <button key={d.value} type="button" onClick={() => toggleDay(d.value)} className={cn(
                  'w-10 h-8 rounded-md border text-xs font-medium transition-all',
                  formDays.includes(d.value)
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:border-primary/40'
                )}>
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Buffer Between Tours (min)</label>
            <select value={formBuffer} onChange={(e) => setFormBuffer(Number(e.target.value))} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30">
              {[0, 5, 10, 15, 20, 30].map((m) => <option key={m} value={m}>{m === 0 ? 'No buffer' : `${m} min`}</option>)}
            </select>
          </div>

          {/* Linked listing (optional) — pulls photos + facts into the booking
              picker and powers the public storefront link. */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Linked listing (optional)</label>
            {linkedProperty ? (
              <div className="flex items-start gap-2.5 rounded-lg border border-border bg-background p-2.5">
                <div className="w-10 h-10 rounded-md bg-muted flex-shrink-0 overflow-hidden">
                  {linkedProperty.photos[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={linkedProperty.photos[0]} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                      <Building2 size={14} />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{formatPropertyAddress(linkedProperty)}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{formatPropertyFacts(linkedProperty) || '—'}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setLinkedProperty(null)}
                  className="flex-shrink-0 w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                  title="Unlink"
                >
                  <X size={13} />
                </button>
              </div>
            ) : pickerOpen ? (
              <div className="space-y-2 rounded-lg border border-border p-2.5">
                <div className="relative">
                  <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    autoFocus
                    value={pickerQuery}
                    onChange={(e) => setPickerQuery(e.target.value)}
                    placeholder="Search address, city, MLS#"
                    className="w-full pl-7 pr-2 py-1.5 text-xs rounded border border-border bg-transparent outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                {pickerSearching && (
                  <p className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
                    <Loader2 size={10} className="animate-spin" /> Searching…
                  </p>
                )}
                {pickerResults.length === 0 && !pickerSearching && (
                  <p className="text-[11px] text-muted-foreground">
                    {pickerQuery.trim() ? 'No matches.' : 'Type to search your listings.'}
                  </p>
                )}
                {pickerResults.length > 0 && (
                  <ul className="rounded border border-border divide-y divide-border max-h-56 overflow-y-auto">
                    {pickerResults.map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => selectLinkedProperty(p)}
                          className="w-full flex items-center gap-2 px-2 py-2 text-left hover:bg-muted/50 transition-colors"
                        >
                          <Building2 size={11} className="text-muted-foreground flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium truncate">{formatPropertyAddress(p)}</p>
                            <p className="text-[10px] text-muted-foreground truncate">{formatPropertyFacts(p) || '—'}</p>
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <button
                  type="button"
                  onClick={() => { setPickerOpen(false); setPickerQuery(''); }}
                  className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                <Building2 size={12} /> Link a listing…
              </button>
            )}
          </div>

          {formError && <p className="text-xs text-destructive">{formError}</p>}

          <div className="flex items-center gap-2 pt-1">
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving && <Loader2 size={14} className="animate-spin mr-1" />}
              {editingId ? 'Update' : 'Create'} Property
            </Button>
            <Button size="sm" variant="ghost" onClick={resetForm}>Cancel</Button>
          </div>
        </div>
      )}

      {profiles.length === 0 && !showForm ? (
        <div className="text-center py-10 text-muted-foreground space-y-2">
          <MapPin size={32} className="mx-auto opacity-30" />
          <p className="text-sm">No property profiles yet</p>
          <p className="text-xs">Add properties to give each listing its own tour schedule and booking link.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {profiles.map((p) => (
            <div key={p.id} className={cn(
              'flex items-center justify-between rounded-lg border px-4 py-3',
              p.isActive ? 'border-border bg-card' : 'border-border bg-muted/30 opacity-60'
            )}>
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <MapPin size={15} className="text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {p.name}
                    {!p.isActive && <span className="ml-2 text-[10px] text-muted-foreground">(inactive)</span>}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {p.address || 'No address'}
                    {' · '}{p.tourDuration}min
                    {' · '}{formatHour(p.startHour)}–{formatHour(p.endHour)}
                    {' · '}{p.daysAvailable.map((d) => DAYS[d]?.label).join(', ')}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button onClick={() => toggleActive(p.id, !p.isActive)} disabled={togglingId === p.id} className={cn('w-7 h-7 flex items-center justify-center rounded-md hover:bg-muted transition-colors disabled:opacity-50', p.isActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground')} title={p.isActive ? 'Deactivate' : 'Activate'}>
                  {togglingId === p.id ? <Loader2 size={14} className="animate-spin" /> : p.isActive ? <Check size={14} /> : <X size={14} />}
                </button>
                <button onClick={() => startEdit(p)} className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground transition-colors" title="Edit">
                  <Pencil size={14} />
                </button>
                <button onClick={() => handleDelete(p.id)} disabled={deletingId === p.id} className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground hover:text-destructive transition-colors" title="Delete">
                  {deletingId === p.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
