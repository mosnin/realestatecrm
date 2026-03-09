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
  options,
}: {
  name: string;
  value: boolean | null;
  onChange: (val: boolean) => void;
  options?: { yes: string; no: string };
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
        <span className="text-sm">{options?.yes ?? 'Yes'}</span>
      </label>
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="radio"
          name={name}
          checked={value === false}
          onChange={() => onChange(false)}
          className="w-4 h-4 accent-primary"
        />
        <span className="text-sm">{options?.no ?? 'No'}</span>
      </label>
    </div>
  );
}

export function Step5History({ form }: StepProps) {
  const { register, setValue, watch } = form;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold">Rental History</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Information about your current and previous landlords.
        </p>
      </div>

      <div className="space-y-4">
        <h3 className="font-medium text-sm">Current landlord</h3>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="currentLandlordName">Name</Label>
            <Input
              id="currentLandlordName"
              placeholder="Landlord name"
              {...register('currentLandlordName')}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="currentLandlordPhone">Phone</Label>
            <Input
              id="currentLandlordPhone"
              type="tel"
              placeholder="(555) 555-5555"
              {...register('currentLandlordPhone')}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Did you pay rent on time?</Label>
          <RadioGroup
            name="rentPaidOnTime"
            value={watch('rentPaidOnTime')}
            onChange={(val) => setValue('rentPaidOnTime', val)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="latePayments">Number of late payments (last 12 months)</Label>
          <Input
            id="latePayments"
            type="number"
            min="0"
            max="100"
            placeholder="0"
            {...register('latePayments')}
          />
        </div>

        <div className="space-y-2">
          <Label>Any lease violations?</Label>
          <RadioGroup
            name="leaseViolations"
            value={watch('leaseViolations')}
            onChange={(val) => setValue('leaseViolations', val)}
          />
        </div>
      </div>

      <div className="border-t border-border pt-5 space-y-4">
        <h3 className="font-medium text-sm">Previous landlord (if applicable)</h3>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="prevLandlordName">Name</Label>
            <Input
              id="prevLandlordName"
              placeholder="Landlord name"
              {...register('prevLandlordName')}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="prevLandlordPhone">Phone</Label>
            <Input
              id="prevLandlordPhone"
              type="tel"
              placeholder="(555) 555-5555"
              {...register('prevLandlordPhone')}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>May we contact your landlord(s) as references?</Label>
          <RadioGroup
            name="referencePermission"
            value={watch('referencePermission')}
            onChange={(val) => setValue('referencePermission', val)}
          />
        </div>
      </div>
    </div>
  );
}
