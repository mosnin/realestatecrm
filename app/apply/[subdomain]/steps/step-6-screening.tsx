'use client';

import { UseFormReturn } from 'react-hook-form';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import type { ApplicationFormData } from '@/lib/types/application';

interface StepProps {
  form: UseFormReturn<ApplicationFormData>;
}

function RadioGroup({
  name,
  value,
  onChange,
}: {
  name: string;
  value: boolean | null;
  onChange: (val: boolean) => void;
}) {
  return (
    <div className="flex gap-4">
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="radio"
          name={name}
          checked={value === true}
          onChange={() => onChange(true)}
          className="w-4 h-4 accent-primary"
        />
        <span className="text-sm">Yes</span>
      </label>
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="radio"
          name={name}
          checked={value === false}
          onChange={() => onChange(false)}
          className="w-4 h-4 accent-primary"
        />
        <span className="text-sm">No</span>
      </label>
    </div>
  );
}

export function Step6Screening({ form }: StepProps) {
  const { register, setValue, watch, formState: { errors } } = form;

  const hasPets = watch('hasPets');

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold">Screening Questions</h2>
        <p className="text-sm text-muted-foreground mt-1">
          These questions are standard for all applicants. Honest answers protect everyone.
        </p>
      </div>

      <div className="space-y-5">
        <div className="space-y-2">
          <Label>Have you ever been evicted?</Label>
          <RadioGroup
            name="priorEvictions"
            value={watch('priorEvictions')}
            onChange={(val) => setValue('priorEvictions', val)}
          />
          {errors.priorEvictions && (
            <p className="text-xs text-destructive">{errors.priorEvictions.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label>Do you have any outstanding balances owed to a landlord?</Label>
          <RadioGroup
            name="outstandingBalances"
            value={watch('outstandingBalances')}
            onChange={(val) => setValue('outstandingBalances', val)}
          />
        </div>

        <div className="space-y-2">
          <Label>Have you filed for bankruptcy in the last 7 years?</Label>
          <RadioGroup
            name="bankruptcy"
            value={watch('bankruptcy')}
            onChange={(val) => setValue('bankruptcy', val)}
          />
        </div>

        <div className="border-t border-border pt-5 space-y-2">
          <Label>I consent to a background and credit check</Label>
          <RadioGroup
            name="backgroundConsent"
            value={watch('backgroundConsent')}
            onChange={(val) => setValue('backgroundConsent', val)}
          />
          <p className="text-xs text-muted-foreground">
            A screening fee may apply. You will be notified before any charge.
          </p>
          {errors.backgroundConsent && (
            <p className="text-xs text-destructive">{errors.backgroundConsent.message}</p>
          )}
        </div>

        <div className="border-t border-border pt-5 space-y-4">
          <h3 className="font-medium text-sm">Occupancy details</h3>

          <div className="space-y-2">
            <Label>Do you have pets?</Label>
            <RadioGroup
              name="hasPets"
              value={hasPets}
              onChange={(val) => setValue('hasPets', val)}
            />
          </div>

          {hasPets && (
            <div className="space-y-1.5">
              <Label htmlFor="petDetails">Describe your pet(s)</Label>
              <Input
                id="petDetails"
                placeholder="e.g. 1 dog, Golden Retriever, 40 lbs"
                {...register('petDetails')}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label>Do you smoke?</Label>
            <RadioGroup
              name="smokingDeclaration"
              value={watch('smokingDeclaration')}
              onChange={(val) => setValue('smokingDeclaration', val)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
