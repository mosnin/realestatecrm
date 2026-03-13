'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
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
  title?: string;
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-3">
        {label}
      </p>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Field({
  id,
  label,
  error,
  children,
}: {
  id?: string;
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
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
  title = 'Add Client',
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
    defaultValues: { type: 'QUALIFICATION', ...defaultValues },
  });

  const type = watch('type');

  async function handleFormSubmit(data: FormData) {
    const tags = data.tags
      ? data.tags.split(',').map((t) => t.trim()).filter(Boolean)
      : [];
    const properties = data.properties
      ? data.properties.split(',').map((p) => p.trim()).filter(Boolean)
      : [];
    const budget = data.budget ? parseFloat(data.budget) : undefined;
    const { tags: _rawTags, properties: _rawProperties, ...rest } = data;
    await onSubmit({ ...rest, budget, properties, tags });
    reset();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6 mt-2">
          <FieldGroup label="Identity">
            <Field id="name" label="Name *" error={errors.name?.message}>
              <Input id="name" {...register('name')} />
            </Field>
            <Field id="type" label="Stage">
              <Select
                value={type}
                onValueChange={(v) => setValue('type', v as FormData['type'])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="QUALIFICATION">Qualifying</SelectItem>
                  <SelectItem value="TOUR">Tour</SelectItem>
                  <SelectItem value="APPLICATION">Applied</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </FieldGroup>

          <div className="border-t border-border" />

          <FieldGroup label="Contact">
            <Field id="email" label="Email" error={errors.email?.message}>
              <Input id="email" type="email" {...register('email')} />
            </Field>
            <Field id="phone" label="Phone">
              <Input id="phone" {...register('phone')} />
            </Field>
          </FieldGroup>

          <div className="border-t border-border" />

          <FieldGroup label="Qualification">
            <Field id="budget" label="Monthly budget">
              <Input
                id="budget"
                type="number"
                step="0.01"
                placeholder="e.g. 2500"
                {...register('budget')}
              />
            </Field>
            <Field id="preferences" label="Preferences & requirements">
              <Textarea
                id="preferences"
                rows={3}
                placeholder="Neighborhoods, bedrooms, pet-friendly…"
                {...register('preferences')}
              />
            </Field>
            <Field id="properties" label="Properties of interest (comma-separated)">
              <Input
                id="properties"
                placeholder="123 Main St, Sunset Villas #12"
                {...register('properties')}
              />
            </Field>
          </FieldGroup>

          <div className="border-t border-border" />

          <FieldGroup label="Additional">
            <Field id="address" label="Current address">
              <Input id="address" {...register('address')} />
            </Field>
            <Field id="tags" label="Tags (comma-separated)">
              <Input
                id="tags"
                placeholder="first-time renter, referral, urgent"
                {...register('tags')}
              />
            </Field>
            <Field id="notes" label="Notes">
              <Textarea id="notes" rows={3} {...register('notes')} />
            </Field>
          </FieldGroup>

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : 'Save client'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
