'use client';

import { useState, useRef, useCallback } from 'react';
import { Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

interface DealInlineFieldProps {
  dealId: string;
  field: string;
  value: string | number | null;
  type: 'text' | 'number' | 'date' | 'textarea';
  label: string;
  /** Optional string prepended to the display value (e.g. "$") */
  prefix?: string;
  /** Optional string appended to the display value (e.g. "%") */
  suffix?: string;
  /**
   * Override what is shown in read mode.
   * Useful when the server needs to format the value differently from its raw form
   * (e.g. a date passed as YYYY-MM-DD but displayed as "Apr 14, 2026").
   */
  displayValue?: string;
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
}

export function DealInlineField({
  dealId,
  field,
  value: initialValue,
  type,
  label,
  prefix,
  suffix,
  displayValue,
  placeholder = 'Not set',
  min,
  max,
  step,
}: DealInlineFieldProps) {
  const [value, setValue] = useState<string | number | null>(initialValue);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  // Prevents the onBlur handler from triggering a second save when Enter already
  // called save() and unmounted the input (blur fires after setEditing(false)).
  const saveCalledRef = useRef(false);

  function startEditing() {
    saveCalledRef.current = false;
    setDraft(value !== null && value !== undefined ? String(value) : '');
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function cancelEditing() {
    saveCalledRef.current = false;
    setEditing(false);
    setDraft('');
  }

  const save = useCallback(async () => {
    // Guard against double-invocation (Enter keydown + subsequent blur)
    if (saveCalledRef.current) return;
    saveCalledRef.current = true;
    setEditing(false);

    // Parse the draft value
    let next: string | number | null;
    if (draft === '' || draft === null) {
      next = null;
    } else if (type === 'number') {
      const parsed = parseFloat(draft);
      next = isNaN(parsed) ? null : parsed;
    } else {
      next = draft.trim() === '' ? null : draft.trim();
    }

    // No change — skip the PATCH
    if (next === value) {
      saveCalledRef.current = false;
      return;
    }

    const previous = value;
    setValue(next);
    setSaving(true);

    try {
      const res = await fetch(`/api/deals/${dealId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: next }),
      });
      if (!res.ok) throw new Error('Failed to save');
    } catch {
      setValue(previous);
      toast.error(`Failed to update ${label.toLowerCase()}`);
    } finally {
      setSaving(false);
      saveCalledRef.current = false;
    }
  }, [draft, value, type, dealId, field, label]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && type !== 'textarea') {
      e.preventDefault();
      save();
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      save();
    } else if (e.key === 'Escape') {
      cancelEditing();
    }
  }

  // displayValue (from server) takes priority; then prefix+value+suffix; then null (shows placeholder)
  const displayText = (() => {
    if (displayValue !== undefined) return displayValue || null;
    if (value === null || value === undefined || String(value) === '') return null;
    const raw = String(value);
    return `${prefix ?? ''}${raw}${suffix ?? ''}`;
  })();

  if (editing) {
    const sharedProps = {
      value: draft,
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        setDraft(e.target.value),
      onKeyDown: handleKeyDown,
      onBlur: save,
      placeholder,
      className: 'text-sm h-8',
    };

    return type === 'textarea' ? (
      <Textarea
        ref={inputRef as React.RefObject<HTMLTextAreaElement>}
        {...sharedProps}
        className="text-sm resize-none min-h-[80px]"
        rows={3}
        onBlur={save}
      />
    ) : (
      <Input
        ref={inputRef as React.RefObject<HTMLInputElement>}
        type={type}
        min={min}
        max={max}
        step={step}
        {...sharedProps}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={startEditing}
      className={cn(
        'group flex items-center gap-1.5 text-left w-full rounded px-1 -mx-1 py-0.5 transition-colors hover:bg-muted/50',
        saving && 'opacity-50',
      )}
      title={`Edit ${label.toLowerCase()}`}
    >
      <span className={cn('text-sm flex-1 min-w-0', !displayText && 'text-muted-foreground italic')}>
        {displayText ?? placeholder}
      </span>
      <Pencil
        size={12}
        className="flex-shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
      />
    </button>
  );
}
