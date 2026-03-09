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
import type { ApplicationFormData, EmploymentStatus } from '@/lib/types/application';

interface StepProps {
  form: UseFormReturn<ApplicationFormData>;
}

export function Step4Income({ form }: StepProps) {
  const {
    register,
    setValue,
    watch,
    formState: { errors },
  } = form;

  const employmentStatus = watch('employmentStatus');
  const showEmployer = employmentStatus && !['UNEMPLOYED', 'RETIRED', 'STUDENT'].includes(employmentStatus);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold">Income</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Your income helps us confirm the property is a good fit.
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="employmentStatus">
            Employment status <span className="text-destructive">*</span>
          </Label>
          <Select
            value={employmentStatus}
            onValueChange={(val) => setValue('employmentStatus', val as EmploymentStatus)}
          >
            <SelectTrigger id="employmentStatus">
              <SelectValue placeholder="Select status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="FULL_TIME">Full-time employed</SelectItem>
              <SelectItem value="PART_TIME">Part-time employed</SelectItem>
              <SelectItem value="SELF_EMPLOYED">Self-employed / Freelance</SelectItem>
              <SelectItem value="UNEMPLOYED">Unemployed</SelectItem>
              <SelectItem value="RETIRED">Retired</SelectItem>
              <SelectItem value="STUDENT">Student</SelectItem>
              <SelectItem value="OTHER">Other income source</SelectItem>
            </SelectContent>
          </Select>
          {errors.employmentStatus && (
            <p className="text-xs text-destructive">{errors.employmentStatus.message}</p>
          )}
        </div>

        {showEmployer && (
          <div className="space-y-1.5">
            <Label htmlFor="employerName">
              {employmentStatus === 'SELF_EMPLOYED' ? 'Business or client name' : 'Employer name'}
            </Label>
            <Input
              id="employerName"
              placeholder={
                employmentStatus === 'SELF_EMPLOYED' ? 'e.g. Freelance / ACME LLC' : 'e.g. Acme Corp'
              }
              {...register('employerName')}
            />
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="monthlyGrossIncome">
            Monthly gross income ($) <span className="text-destructive">*</span>
          </Label>
          <Input
            id="monthlyGrossIncome"
            type="number"
            min="0"
            step="100"
            placeholder="5000"
            {...register('monthlyGrossIncome', {
              required: 'Monthly income is required',
            })}
          />
          <p className="text-xs text-muted-foreground">
            Before taxes. Include all income sources you want counted.
          </p>
          {errors.monthlyGrossIncome && (
            <p className="text-xs text-destructive">{errors.monthlyGrossIncome.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="additionalIncome">
            Additional monthly income ($) <span className="text-muted-foreground text-xs">(optional)</span>
          </Label>
          <Input
            id="additionalIncome"
            type="number"
            min="0"
            step="100"
            placeholder="0"
            {...register('additionalIncome')}
          />
          <p className="text-xs text-muted-foreground">
            Benefits, rental income, alimony, side income, etc.
          </p>
        </div>
      </div>
    </div>
  );
}
