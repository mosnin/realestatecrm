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
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import type { DealStage, Contact } from '@prisma/client';

const schema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  value: z.string().optional(),
  address: z.string().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  closeDate: z.string().optional(),
  stageId: z.string().min(1, 'Stage is required'),
  contactIds: z.array(z.string()).optional()
});

type FormData = z.infer<typeof schema>;

interface DealFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: FormData) => Promise<void>;
  stages: DealStage[];
  contacts: Pick<Contact, 'id' | 'name'>[];
  defaultValues?: Partial<FormData>;
  title?: string;
}

export function DealForm({
  open,
  onOpenChange,
  onSubmit,
  stages,
  contacts,
  defaultValues,
  title = 'Add Deal'
}: DealFormProps) {
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
      priority: 'MEDIUM',
      contactIds: [],
      ...defaultValues
    }
  });

  const selectedContactIds = watch('contactIds') ?? [];
  const stageId = watch('stageId');
  const priority = watch('priority');

  function toggleContact(id: string) {
    const current = watch('contactIds') ?? [];
    setValue(
      'contactIds',
      current.includes(id) ? current.filter((c) => c !== id) : [...current, id]
    );
  }

  async function handleFormSubmit(data: FormData) {
    await onSubmit(data);
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
            <Label htmlFor="title">Title *</Label>
            <Input id="title" {...register('title')} />
            {errors.title && (
              <p className="text-xs text-destructive">{errors.title.message}</p>
            )}
          </div>

          <div className="space-y-1">
            <Label>Stage *</Label>
            <Select value={stageId} onValueChange={(v) => setValue('stageId', v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select stage" />
              </SelectTrigger>
              <SelectContent>
                {stages.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    <span className="flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: s.color }}
                      />
                      {s.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Priority</Label>
            <Select value={priority} onValueChange={(v) => setValue('priority', v as any)}>
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

          <div className="space-y-1">
            <Label htmlFor="value">Deal Value ($)</Label>
            <Input id="value" type="number" placeholder="500000" {...register('value')} />
          </div>

          <div className="space-y-1">
            <Label htmlFor="address">Property Address</Label>
            <Input id="address" {...register('address')} />
          </div>

          <div className="space-y-1">
            <Label htmlFor="closeDate">Expected Close Date</Label>
            <Input id="closeDate" type="date" {...register('closeDate')} />
          </div>

          <div className="space-y-1">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" rows={3} {...register('description')} />
          </div>

          {contacts.length > 0 && (
            <div className="space-y-2">
              <Label>Linked Contacts</Label>
              <div className="border rounded-md divide-y max-h-40 overflow-y-auto">
                {contacts.map((c) => (
                  <label
                    key={c.id}
                    className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-accent/50"
                  >
                    <input
                      type="checkbox"
                      checked={selectedContactIds.includes(c.id)}
                      onChange={() => toggleContact(c.id)}
                      className="rounded"
                    />
                    <span className="text-sm">{c.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : 'Save Deal'}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
