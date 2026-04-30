'use client';

import { useState, useRef, KeyboardEvent } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Loader2, X } from 'lucide-react';
import { CONTACT_STAGES } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { H2, PRIMARY_PILL, GHOST_PILL } from '@/lib/typography';

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  budget: z.string().optional(),
  preferences: z.string().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
  type: z.enum(['QUALIFICATION', 'TOUR', 'APPLICATION']),
  tags: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

type SubmitData = Omit<FormData, 'tags' | 'budget'> & {
  tags: string[];
  properties: string[];
  budget?: number;
};

interface ContactFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: SubmitData) => Promise<void>;
  defaultValues?: Partial<FormData & { properties?: string }>;
  /** When set, overrides the default "Add a person" / "Edit person" title. */
  title?: string;
  /** Distinguishes add vs. edit so we can label the submit button correctly. */
  mode?: 'add' | 'edit';
}

function FieldRow({
  id,
  label,
  optional,
  error,
  children,
}: {
  id?: string;
  label: string;
  optional?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-[12.5px] font-medium text-foreground">
        {label}
        {optional && (
          <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">(optional)</span>
        )}
      </Label>
      {children}
      {error && <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}
    </div>
  );
}

/**
 * Chip input — type-and-commit list of strings. Enter or comma commits
 * the current draft as a chip. Backspace on empty input pops the last chip.
 * Clicking a chip's X removes it. The input ALWAYS sits at the end so the
 * row reads left-to-right like a sentence.
 */
function ChipInput({
  id,
  values,
  onChange,
  placeholder,
}: {
  id?: string;
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  function commit(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return;
    if (values.includes(trimmed)) {
      setDraft('');
      return;
    }
    onChange([...values, trimmed]);
    setDraft('');
  }

  function remove(index: number) {
    onChange(values.filter((_, i) => i !== index));
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commit(draft);
      return;
    }
    if (e.key === 'Backspace' && draft === '' && values.length > 0) {
      e.preventDefault();
      onChange(values.slice(0, -1));
    }
  }

  return (
    <div
      onClick={() => inputRef.current?.focus()}
      className={cn(
        'flex flex-wrap items-center gap-1.5 min-h-9 w-full rounded-md border border-input bg-transparent px-2 py-1.5',
        'focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30 transition-[box-shadow,border-color]',
      )}
    >
      {values.map((value, index) => (
        <span
          key={`${value}-${index}`}
          className="inline-flex items-center gap-1 h-7 pl-2.5 pr-1 rounded-md bg-foreground/[0.04] border border-border/60 text-[12px] text-foreground"
        >
          {value}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              remove(index);
            }}
            aria-label={`Remove ${value}`}
            className="w-4 h-4 inline-flex items-center justify-center rounded-sm text-muted-foreground hover:text-foreground hover:bg-foreground/[0.06] transition-colors"
          >
            <X size={11} strokeWidth={2} />
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        id={id}
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => commit(draft)}
        placeholder={values.length === 0 ? placeholder : ''}
        className="bg-transparent outline-none placeholder:text-muted-foreground/60 text-sm h-7 flex-1 min-w-[120px]"
      />
    </div>
  );
}

export function ContactForm({
  open,
  onOpenChange,
  onSubmit,
  defaultValues,
  title,
  mode = 'add',
}: ContactFormProps) {
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { type: CONTACT_STAGES[0].key, ...defaultValues },
  });

  // Properties live outside react-hook-form so the chip input owns them.
  const initialProperties = (() => {
    const raw = defaultValues?.properties;
    if (!raw) return [];
    return raw.split(',').map((p) => p.trim()).filter(Boolean);
  })();
  const [properties, setProperties] = useState<string[]>(initialProperties);

  const type = watch('type');
  const displayTitle = title ?? (mode === 'edit' ? 'Edit person' : 'Add a person');

  function resetAll() {
    reset();
    setProperties([]);
  }

  async function handleFormSubmit(data: FormData) {
    const tags = data.tags
      ? data.tags.split(',').map((t) => t.trim()).filter(Boolean)
      : [];
    const budget = data.budget ? parseFloat(data.budget) : undefined;
    const { tags: _rawTags, ...rest } = data;
    try {
      await onSubmit({ ...rest, budget, properties, tags });
      toast.success(mode === 'edit' ? 'Saved' : 'Added');
    } catch {
      toast.error('Failed to save');
      return;
    }
    resetAll();
    onOpenChange(false);
  }

  // Stage segmented control — show inline if 4 or fewer stages; otherwise
  // fall back to the existing Select. Today we have 3, so this always renders
  // as the segmented control.
  const useSegmented = CONTACT_STAGES.length <= 4;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md w-full max-h-[90vh] overflow-y-auto p-0 gap-0">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border/60">
          <h2 className={H2}>{displayTitle}</h2>
        </div>

        <form onSubmit={handleSubmit(handleFormSubmit)}>
          <div className="p-6 space-y-4">
            <FieldRow id="name" label="Name" error={errors.name?.message}>
              <Input id="name" {...register('name')} autoFocus />
            </FieldRow>

            <FieldRow id="type" label="Stage">
              {useSegmented ? (
                <div
                  role="radiogroup"
                  aria-label="Stage"
                  className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-foreground/[0.02] p-1"
                >
                  {CONTACT_STAGES.map((s) => {
                    const active = type === s.key;
                    return (
                      <button
                        key={s.key}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => setValue('type', s.key, { shouldDirty: true })}
                        className={cn(
                          'h-7 px-3 rounded-[5px] text-xs font-medium transition-colors duration-150',
                          active
                            ? 'bg-foreground text-background'
                            : 'text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground',
                        )}
                      >
                        {s.label}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <Select
                  value={type}
                  onValueChange={(v) => setValue('type', v as FormData['type'])}
                >
                  <SelectTrigger id="type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CONTACT_STAGES.map((s) => (
                      <SelectItem key={s.key} value={s.key}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FieldRow>

            <FieldRow id="email" label="Email" optional error={errors.email?.message}>
              <Input id="email" type="email" {...register('email')} />
            </FieldRow>

            <FieldRow id="phone" label="Phone" optional>
              <Input id="phone" {...register('phone')} />
            </FieldRow>

            {/* Hairline divider — identity above, qualification below */}
            <div className="border-t border-border/60 !my-7" />

            <FieldRow id="budget" label="Monthly budget" optional>
              <Input
                id="budget"
                type="number"
                step="0.01"
                placeholder="e.g. 2500"
                {...register('budget')}
              />
            </FieldRow>

            <FieldRow id="preferences" label="Looking for" optional>
              <Textarea
                id="preferences"
                rows={3}
                placeholder="Neighborhoods, bedrooms, pet-friendly…"
                {...register('preferences')}
              />
            </FieldRow>

            <FieldRow id="properties" label="Properties of interest" optional>
              <ChipInput
                id="properties"
                values={properties}
                onChange={setProperties}
                placeholder="Type an address, press Enter"
              />
            </FieldRow>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-border/60 flex items-center justify-end gap-1">
            <button
              type="button"
              onClick={() => {
                resetAll();
                onOpenChange(false);
              }}
              className={GHOST_PILL}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className={cn(PRIMARY_PILL, 'disabled:opacity-60 disabled:cursor-not-allowed')}
            >
              {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {mode === 'edit' ? 'Save' : 'Add'}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
