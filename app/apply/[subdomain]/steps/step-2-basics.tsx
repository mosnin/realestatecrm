'use client';

import { UseFormReturn } from 'react-hook-form';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import type { ApplicationFormData } from '@/lib/types/application';

interface StepProps {
  form: UseFormReturn<ApplicationFormData>;
}

export function Step2Basics({ form }: StepProps) {
  const {
    register,
    formState: { errors },
  } = form;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold">Your Information</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Legal name and contact details for the primary applicant.
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="legalName">
            Legal name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="legalName"
            placeholder="First Middle Last"
            autoComplete="name"
            {...register('legalName', { required: 'Legal name is required' })}
          />
          {errors.legalName && (
            <p className="text-xs text-destructive">{errors.legalName.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="email">
            Email address <span className="text-destructive">*</span>
          </Label>
          <Input
            id="email"
            type="email"
            placeholder="you@example.com"
            autoComplete="email"
            {...register('email', {
              required: 'Email is required',
              pattern: {
                value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                message: 'Enter a valid email address',
              },
            })}
          />
          {errors.email && (
            <p className="text-xs text-destructive">{errors.email.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="phone">Mobile phone</Label>
          <Input
            id="phone"
            type="tel"
            placeholder="(555) 555-5555"
            autoComplete="tel"
            {...register('phone')}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="dateOfBirth">Date of birth</Label>
          <Input
            id="dateOfBirth"
            type="date"
            autoComplete="bday"
            {...register('dateOfBirth')}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="idLastFour">Last 4 digits of SSN or government ID</Label>
          <Input
            id="idLastFour"
            type="password"
            maxLength={4}
            placeholder="••••"
            autoComplete="off"
            inputMode="numeric"
            {...register('idLastFour', {
              maxLength: {
                value: 4,
                message: 'Enter last 4 digits only',
              },
              pattern: {
                value: /^\d{0,4}$/,
                message: 'Numbers only',
              },
            })}
          />
          <p className="text-xs text-muted-foreground">
            Used for identity verification only. Not stored in plain text.
          </p>
          {errors.idLastFour && (
            <p className="text-xs text-destructive">{errors.idLastFour.message}</p>
          )}
        </div>
      </div>
    </div>
  );
}
