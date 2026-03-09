'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
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
import { cn } from '@/lib/utils';
import type { DealStage, Contact } from '@prisma/client';

const schema = z.object({
  title:      z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  value:      z.string().optional(),
  address:    z.string().optional(),
  priority:   z.enum(['LOW', 'MEDIUM', 'HIGH']),
  closeDate:  z.string().optional(),
  stageId:    z.string().min(1, 'Stage is required'),
  contactIds: z.array(z.string()).optional(),
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

const PRIORITY_META = {
  LOW:    { label: 'Low',    className: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-400' },
  MEDIUM: { label: 'Medium', className: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400' },
  HIGH:   { label: 'High',   className: 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400' },
} as const;

export function DealForm({
  open, onOpenChange, onSubmit, stages, contacts, defaultValues, title = 'Add Deal',
}: DealFormProps) {
  const {
    register, handleSubmit, setValue, watch, reset,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { priority: 'MEDIUM', contactIds: [], ...defaultValues },
  });

  const selectedContactIds = watch('contactIds') ?? [];
  const stageId   = watch('stageId');
  const priority  = watch('priority');

  function toggleContact(id: string) {
    const current = watch('contactIds') ?? [];
    setValue('contactIds', current.includes(id) ? current.filter((c) => c !== id) : [...current, id]);
  }

  async function handleFormSubmit(data: FormData) {
    await onSubmit(data);
    reset();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border">
          <DialogTitle className="text-base font-semibold">{title}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(handleFormSubmit)}>
          <div className="px-6 py-5 space-y-5">

            {/* Title */}
            <div className="space-y-1.5">
              <Label htmlFor="deal-title" className="text-sm font-medium">
                Title <span className="text-destructive">*</span>
              </Label>
              <Input id="deal-title" placeholder="e.g. 123 Oak Ave — Johnson Family" {...register('title')} />
              {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
            </div>

            {/* Stage + Priority row */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">
                  Stage <span className="text-destructive">*</span>
                </Label>
                <Select value={stageId} onValueChange={(v) => setValue('stageId', v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select stage" />
                  </SelectTrigger>
                  <SelectContent>
                    {stages.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        <span className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                          {s.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.stageId && <p className="text-xs text-destructive">{errors.stageId.message}</p>}
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Priority</Label>
                <div className="flex gap-1.5">
                  {(['LOW', 'MEDIUM', 'HIGH'] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setValue('priority', p)}
                      className={cn(
                        'flex-1 h-10 rounded-lg border text-xs font-medium transition-all',
                        priority === p ? PRIORITY_META[p].className : 'border-border bg-background text-muted-foreground hover:border-border/80'
                      )}
                    >
                      {PRIORITY_META[p].label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Value + Close date */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="deal-value" className="text-sm font-medium">Deal value</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                  <Input id="deal-value" type="number" className="pl-7" placeholder="500,000" {...register('value')} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="deal-close" className="text-sm font-medium">Close date</Label>
                <Input id="deal-close" type="date" {...register('closeDate')} />
              </div>
            </div>

            {/* Address */}
            <div className="space-y-1.5">
              <Label htmlFor="deal-address" className="text-sm font-medium">Property address</Label>
              <Input id="deal-address" placeholder="123 Main St, City, State" {...register('address')} />
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label htmlFor="deal-desc" className="text-sm font-medium">Notes</Label>
              <Textarea id="deal-desc" rows={3} placeholder="Additional details about this deal..." {...register('description')} />
            </div>

            {/* Linked contacts */}
            {contacts.length > 0 && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">Linked leads</Label>
                <div className="rounded-lg border border-border divide-y divide-border max-h-36 overflow-y-auto">
                  {contacts.map((c) => (
                    <label key={c.id} className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-muted/40 transition-colors">
                      <input
                        type="checkbox"
                        checked={selectedContactIds.includes(c.id)}
                        onChange={() => toggleContact(c.id)}
                        className="h-4 w-4 rounded border-input accent-primary cursor-pointer"
                      />
                      <span className="text-sm">{c.name}</span>
                    </label>
                  ))}
                </div>
                {selectedContactIds.length > 0 && (
                  <p className="text-xs text-muted-foreground">{selectedContactIds.length} linked</p>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="px-6 py-4 border-t border-border gap-2">
            <Button type="button" variant="outline" onClick={() => { reset(); onOpenChange(false); }}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting} className="min-w-24">
              {isSubmitting ? 'Saving…' : 'Save deal'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
