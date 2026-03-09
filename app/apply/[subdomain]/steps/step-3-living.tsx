'use client';

import { UseFormReturn } from 'react-hook-form';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ApplicationFormData, HousingStatus } from '@/lib/types/application';

interface StepProps {
  form: UseFormReturn<ApplicationFormData>;
}

export function Step3Living({ form }: StepProps) {
  const {
    register,
    setValue,
    watch,
    formState: { errors },
  } = form;

  const housingStatus = watch('housingStatus');

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold">Current Living Situation</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Tell us about where you live now and your household.
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="currentAddress">Current address</Label>
          <Input
            id="currentAddress"
            placeholder="Street, City, State, ZIP"
            autoComplete="street-address"
            {...register('currentAddress')}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="housingStatus">Current housing situation</Label>
          <Select
            value={housingStatus}
            onValueChange={(val) => setValue('housingStatus', val as HousingStatus)}
          >
            <SelectTrigger id="housingStatus">
              <SelectValue placeholder="Select one" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="RENT">Renting</SelectItem>
              <SelectItem value="OWN">Own my home</SelectItem>
              <SelectItem value="RENT_FREE">Living rent-free</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {housingStatus === 'RENT' && (
          <div className="space-y-1.5">
            <Label htmlFor="currentPayment">Current monthly rent ($)</Label>
            <Input
              id="currentPayment"
              type="number"
              min="0"
              step="50"
              placeholder="1500"
              {...register('currentPayment')}
            />
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="lengthAtAddress">How long have you lived there?</Label>
          <Select
            value={watch('lengthAtAddress')}
            onValueChange={(val) => setValue('lengthAtAddress', val)}
          >
            <SelectTrigger id="lengthAtAddress">
              <SelectValue placeholder="Select duration" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Less than 6 months">Less than 6 months</SelectItem>
              <SelectItem value="6–12 months">6–12 months</SelectItem>
              <SelectItem value="1–2 years">1–2 years</SelectItem>
              <SelectItem value="2–5 years">2–5 years</SelectItem>
              <SelectItem value="5+ years">5+ years</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="reasonForMoving">Reason for moving</Label>
          <Textarea
            id="reasonForMoving"
            placeholder="e.g. Relocating for work, lease ending, need more space..."
            rows={3}
            {...register('reasonForMoving')}
          />
        </div>
      </div>

      {/* Household section */}
      <div className="border-t border-border pt-5 space-y-4">
        <h3 className="font-medium">Household</h3>

        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="adultsOnApp">Adults</Label>
            <Input
              id="adultsOnApp"
              type="number"
              min="1"
              max="10"
              placeholder="1"
              {...register('adultsOnApp')}
            />
            {errors.adultsOnApp && (
              <p className="text-xs text-destructive">{errors.adultsOnApp.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="children">Children</Label>
            <Input
              id="children"
              type="number"
              min="0"
              max="20"
              placeholder="0"
              {...register('children')}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="roommates">Roommates</Label>
            <Input
              id="roommates"
              type="number"
              min="0"
              max="10"
              placeholder="0"
              {...register('roommates')}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="emergencyContactName">Emergency contact name</Label>
            <Input
              id="emergencyContactName"
              placeholder="Full name"
              {...register('emergencyContactName')}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="emergencyContactPhone">Emergency contact phone</Label>
            <Input
              id="emergencyContactPhone"
              type="tel"
              placeholder="(555) 555-5555"
              {...register('emergencyContactPhone')}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
