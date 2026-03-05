'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
  type: z.enum(['BUYER', 'SELLER', 'AGENT', 'OTHER']),
  tags: z.string().optional()
});

type FormData = z.infer<typeof schema>;

type SubmitData = Omit<FormData, 'tags'> & { tags: string[] };

interface ContactFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: SubmitData) => Promise<void>;
  defaultValues?: Partial<FormData>;
  title?: string;
}

export function ContactForm({
  open,
  onOpenChange,
  onSubmit,
  defaultValues,
  title = 'Add Contact'
}: ContactFormProps) {
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      type: 'OTHER',
      ...defaultValues
    }
  });

  const type = watch('type');

  async function handleFormSubmit(data: FormData) {
    const tags = data.tags
      ? data.tags.split(',').map((t) => t.trim()).filter(Boolean)
      : [];
    const { tags: _rawTags, ...rest } = data;
    await onSubmit({ ...rest, tags });
    reset();
    onOpenChange(false);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>
        <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4 mt-6">
          <div className="space-y-1">
            <Label htmlFor="name">Name *</Label>
            <Input id="name" {...register('name')} />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="type">Type</Label>
            <Select
              value={type}
              onValueChange={(v) => setValue('type', v as any)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="BUYER">Buyer</SelectItem>
                <SelectItem value="SELLER">Seller</SelectItem>
                <SelectItem value="AGENT">Agent</SelectItem>
                <SelectItem value="OTHER">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" {...register('email')} />
            {errors.email && (
              <p className="text-xs text-destructive">{errors.email.message}</p>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="phone">Phone</Label>
            <Input id="phone" {...register('phone')} />
          </div>

          <div className="space-y-1">
            <Label htmlFor="address">Address</Label>
            <Input id="address" {...register('address')} />
          </div>

          <div className="space-y-1">
            <Label htmlFor="tags">Tags (comma-separated)</Label>
            <Input id="tags" placeholder="first-time buyer, luxury, referral" {...register('tags')} />
          </div>

          <div className="space-y-1">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" rows={4} {...register('notes')} />
          </div>

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : 'Save Contact'}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
