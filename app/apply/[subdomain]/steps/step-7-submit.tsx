'use client';

import { UseFormReturn } from 'react-hook-form';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { CheckCircle2, Circle } from 'lucide-react';
import type { ApplicationFormData } from '@/lib/types/application';

interface StepProps {
  form: UseFormReturn<ApplicationFormData>;
}

function CheckItem({
  checked,
  onToggle,
  label,
  description,
}: {
  checked: boolean;
  onToggle: () => void;
  label: string;
  description?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex items-start gap-3 w-full text-left py-3 px-4 rounded-lg border border-border hover:bg-accent/50 transition-colors"
    >
      {checked ? (
        <CheckCircle2 size={20} className="text-primary shrink-0 mt-0.5" />
      ) : (
        <Circle size={20} className="text-muted-foreground shrink-0 mt-0.5" />
      )}
      <div>
        <p className="text-sm font-medium">{label}</p>
        {description && (
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        )}
      </div>
    </button>
  );
}

export function Step7Submit({ form }: StepProps) {
  const { register, setValue, watch, formState: { errors } } = form;

  const hasGovId = watch('hasGovId');
  const hasPayStubs = watch('hasPayStubs');
  const hasBankStatements = watch('hasBankStatements');
  const screeningConsent = watch('screeningConsent');
  const truthCertification = watch('truthCertification');

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold">Review & Submit</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Confirm your documents and sign to submit.
        </p>
      </div>

      {/* Document checklist */}
      <div className="space-y-3">
        <h3 className="font-medium text-sm">Documents you have ready</h3>
        <p className="text-xs text-muted-foreground">
          Check all that apply. Your agent will follow up to collect these.
        </p>

        <div className="space-y-2">
          <CheckItem
            checked={hasGovId}
            onToggle={() => setValue('hasGovId', !hasGovId)}
            label="Government-issued ID"
            description="Driver's license, passport, or state ID"
          />
          <CheckItem
            checked={hasPayStubs}
            onToggle={() => setValue('hasPayStubs', !hasPayStubs)}
            label="Recent pay stubs"
            description="Last 2–3 months of pay stubs or income statements"
          />
          <CheckItem
            checked={hasBankStatements}
            onToggle={() => setValue('hasBankStatements', !hasBankStatements)}
            label="Bank statements"
            description="Last 2 months of statements showing consistent balance"
          />
        </div>
      </div>

      {/* Consents */}
      <div className="border-t border-border pt-5 space-y-4">
        <h3 className="font-medium text-sm">Agreements</h3>

        <div className="space-y-3">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={screeningConsent ?? false}
              onChange={(e) => setValue('screeningConsent', e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-primary"
            />
            <span className="text-sm leading-relaxed">
              I authorize a credit and background check. I understand a screening
              fee may apply and I will be notified before any charge is processed.
            </span>
          </label>
          {errors.screeningConsent && (
            <p className="text-xs text-destructive">{errors.screeningConsent.message}</p>
          )}

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={truthCertification ?? false}
              onChange={(e) => setValue('truthCertification', e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-primary"
            />
            <span className="text-sm leading-relaxed">
              I certify that all information provided in this application is true
              and complete. I understand that false statements may result in denial
              or termination of a lease.
            </span>
          </label>
          {errors.truthCertification && (
            <p className="text-xs text-destructive">{errors.truthCertification.message}</p>
          )}
        </div>
      </div>

      {/* Electronic signature */}
      <div className="border-t border-border pt-5 space-y-2">
        <Label htmlFor="electronicSignature">
          Electronic signature <span className="text-destructive">*</span>
        </Label>
        <p className="text-xs text-muted-foreground">
          Type your full legal name exactly as it appears on your application.
        </p>
        <Input
          id="electronicSignature"
          placeholder="Your full legal name"
          {...register('electronicSignature', {
            required: 'Signature is required to submit',
          })}
        />
        {errors.electronicSignature && (
          <p className="text-xs text-destructive">{errors.electronicSignature.message}</p>
        )}
        <p className="text-xs text-muted-foreground">
          By typing your name above, you are signing this application electronically.
        </p>
      </div>
    </div>
  );
}
