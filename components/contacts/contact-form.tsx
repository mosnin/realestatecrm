'use client';

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
import { Loader2 } from 'lucide-react';
import { CONTACT_STAGES } from '@/lib/constants';
import { cn } from '@/lib/utils';

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  budget: z.string().optional(),
  preferences: z.string().optional(),
  properties: z.string().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
  type: z.enum(['QUALIFICATION', 'TOUR', 'APPLICATION']),
  tags: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

type SubmitData = Omit<FormData, 'tags' | 'properties' | 'budget'> & {
  tags: string[];
  properties: string[];
  budget?: number;
};

interface ContactFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: SubmitData) => Promise<void>;
  defaultValues?: Partial<FormData>;
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
      {error && <p className="text-xs text-destructive">{error}</p>}
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

  const type = watch('type');
  const resolvedTitle = title ?? (mode === 'edit' ? 'Edit person' : 'Add a person');

  async function handleFormSubmit(data: FormData) {
    const tags = data.tags
      ? data.tags.split(',').map((t) => t.trim()).filter(Boolean)
      : [];
    const properties = data.properties
      ? data.properties.split(',').map((p) => p.trim()).filter(Boolean)
      : [];
    const budget = data.budget ? parseFloat(data.budget) : undefined;
    const { tags: _rawTags, properties: _rawProperties, ...rest } = data;
    try {
      await onSubmit({ ...rest, budget, properties, tags });
      toast.success(mode === 'edit' ? 'Saved' : 'Added');
    } catch {
      toast.error('Failed to save');
      return;
    }
    reset();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg w-full max-h-[90vh] overflow-y-auto p-0 gap-0">
        {/* Title — serif, sentence case, no subtitle */}
        <div className="px-6 pt-6 pb-5">
          <h2
            className="text-2xl tracking-tight text-foreground"
            style={{ fontFamily: 'var(--font-title)' }}
          >
            {resolvedTitle}
          </h2>
        </div>

        <form onSubmit={handleSubmit(handleFormSubmit)} className="px-6 pb-6">
          {/* Section 1 — Identity */}
          <div className="space-y-4">
            <FieldRow id="name" label="Name" error={errors.name?.message}>
              <Input id="name" {...register('name')} autoFocus />
            </FieldRow>
            <FieldRow id="type" label="Stage">
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
            </FieldRow>
            <FieldRow id="email" label="Email" optional error={errors.email?.message}>
              <Input id="email" type="email" {...register('email')} />
            </FieldRow>
            <FieldRow id="phone" label="Phone" optional>
              <Input id="phone" {...register('phone')} />
            </FieldRow>
          </div>

          {/* Hairline divider — replaces the all-caps section header */}
          <div className="border-t border-border/60 my-7" />

          {/* Section 2 — What they're looking for */}
          <div className="space-y-4">
            <FieldRow id="budget" label="Monthly budget" optional>
              <Input
                id="budget"
                type="number"
                step="0.01"
                placeholder="e.g. 2500"
                {...register('budget')}
              />
            </FieldRow>
            <FieldRow id="preferences" label="Preferences & requirements" optional>
              <Textarea
                id="preferences"
                rows={3}
                placeholder="Neighborhoods, bedrooms, pet-friendly…"
                {...register('preferences')}
              />
            </FieldRow>
            <FieldRow id="properties" label="Properties of interest" optional>
              <Input
                id="properties"
                placeholder="123 Main St, Sunset Villas #12"
                {...register('properties')}
              />
            </FieldRow>
          </div>

          {/* Footer — ghost cancel left, paper-flat primary right */}
          <div className="mt-8 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => {
                reset();
                onOpenChange(false);
              }}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-150 px-1 py-1"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className={cn(
                'inline-flex items-center gap-1.5 h-9 px-4 rounded-full bg-foreground text-background text-sm font-medium',
                'hover:bg-foreground/90 active:scale-[0.98] transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed',
              )}
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
