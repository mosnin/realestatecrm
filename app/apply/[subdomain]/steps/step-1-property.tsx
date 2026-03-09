'use client';

import { UseFormReturn } from 'react-hook-form';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ApplicationFormData } from '@/lib/types/application';

interface StepProps {
  form: UseFormReturn<ApplicationFormData>;
}

export function Step1Property({ form }: StepProps) {
  const {
    register,
    setValue,
    watch,
    formState: { errors },
  } = form;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold">Property Details</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Tell us about the property you&apos;re applying for.
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="propertyAddress">Property address</Label>
          <Input
            id="propertyAddress"
            placeholder="123 Main St, City, State 12345"
            {...register('propertyAddress')}
          />
          {errors.propertyAddress && (
            <p className="text-xs text-destructive">{errors.propertyAddress.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="unitType">Unit or bedroom type</Label>
          <Select
            value={watch('unitType')}
            onValueChange={(val) => setValue('unitType', val)}
          >
            <SelectTrigger id="unitType">
              <SelectValue placeholder="Select unit type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Studio">Studio</SelectItem>
              <SelectItem value="1 Bedroom">1 Bedroom</SelectItem>
              <SelectItem value="2 Bedroom">2 Bedroom</SelectItem>
              <SelectItem value="3 Bedroom">3 Bedroom</SelectItem>
              <SelectItem value="4+ Bedroom">4+ Bedroom</SelectItem>
              <SelectItem value="Townhouse">Townhouse</SelectItem>
              <SelectItem value="Single Family">Single Family Home</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="targetMoveIn">Target move-in date</Label>
          <Input
            id="targetMoveIn"
            type="date"
            {...register('targetMoveIn')}
          />
          {errors.targetMoveIn && (
            <p className="text-xs text-destructive">{errors.targetMoveIn.message}</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="monthlyRent">Monthly rent ($)</Label>
            <Input
              id="monthlyRent"
              type="number"
              min="0"
              step="50"
              placeholder="2000"
              {...register('monthlyRent')}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="occupantCount">Total occupants</Label>
            <Input
              id="occupantCount"
              type="number"
              min="1"
              max="20"
              placeholder="2"
              {...register('occupantCount')}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="leaseTerm">Lease term preference</Label>
          <Select
            value={watch('leaseTerm')}
            onValueChange={(val) => setValue('leaseTerm', val)}
          >
            <SelectTrigger id="leaseTerm">
              <SelectValue placeholder="Select lease term" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Month-to-month">Month-to-month</SelectItem>
              <SelectItem value="6 months">6 months</SelectItem>
              <SelectItem value="12 months">12 months</SelectItem>
              <SelectItem value="18 months">18 months</SelectItem>
              <SelectItem value="24 months">24 months</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
