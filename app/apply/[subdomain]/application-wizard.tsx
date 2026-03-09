'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Loader2, CheckCircle2 } from 'lucide-react';
import { Step1Property } from './steps/step-1-property';
import { Step2Basics } from './steps/step-2-basics';
import { Step3Living } from './steps/step-3-living';
import { Step4Income } from './steps/step-4-income';
import { Step5History } from './steps/step-5-history';
import { Step6Screening } from './steps/step-6-screening';
import { Step7Submit } from './steps/step-7-submit';
import type { ApplicationFormData, PersistedAppState } from '@/lib/types/application';

interface Props {
  spaceId: string;
  subdomain: string;
  spaceName: string;
}

const STEPS = [
  { label: 'Property', component: Step1Property },
  { label: 'Basics', component: Step2Basics },
  { label: 'Living', component: Step3Living },
  { label: 'Income', component: Step4Income },
  { label: 'History', component: Step5History },
  { label: 'Screening', component: Step6Screening },
  { label: 'Submit', component: Step7Submit },
] as const;

const TOTAL_STEPS = STEPS.length;

// Fields validated per step (for react-hook-form trigger)
const STEP_FIELDS: (keyof ApplicationFormData)[][] = [
  ['propertyAddress', 'targetMoveIn'], // Step 1
  ['legalName', 'email'], // Step 2
  [], // Step 3
  ['monthlyGrossIncome'], // Step 4
  [], // Step 5
  [], // Step 6
  ['electronicSignature'], // Step 7
];

const DEFAULT_VALUES: ApplicationFormData = {
  propertyAddress: '',
  unitType: '',
  targetMoveIn: '',
  monthlyRent: '',
  leaseTerm: '',
  occupantCount: '',
  legalName: '',
  email: '',
  phone: '',
  dateOfBirth: '',
  idLastFour: '',
  currentAddress: '',
  housingStatus: '',
  currentPayment: '',
  lengthAtAddress: '',
  reasonForMoving: '',
  adultsOnApp: '',
  children: '',
  roommates: '',
  emergencyContactName: '',
  emergencyContactPhone: '',
  employmentStatus: '',
  employerName: '',
  monthlyGrossIncome: '',
  additionalIncome: '',
  currentLandlordName: '',
  currentLandlordPhone: '',
  prevLandlordName: '',
  prevLandlordPhone: '',
  rentPaidOnTime: null,
  latePayments: '',
  leaseViolations: null,
  referencePermission: null,
  priorEvictions: null,
  outstandingBalances: null,
  bankruptcy: null,
  backgroundConsent: null,
  hasPets: null,
  petDetails: '',
  smokingDeclaration: null,
  hasGovId: false,
  hasPayStubs: false,
  hasBankStatements: false,
  screeningConsent: false,
  truthCertification: false,
  electronicSignature: '',
};

function getStorageKey(subdomain: string) {
  return `chippi_app_${subdomain}`;
}

function loadState(subdomain: string): PersistedAppState | null {
  try {
    const raw = localStorage.getItem(getStorageKey(subdomain));
    if (!raw) return null;
    return JSON.parse(raw) as PersistedAppState;
  } catch {
    return null;
  }
}

function saveState(subdomain: string, state: PersistedAppState) {
  try {
    localStorage.setItem(getStorageKey(subdomain), JSON.stringify(state));
  } catch {
    // Silently ignore localStorage errors
  }
}

function clearState(subdomain: string) {
  try {
    localStorage.removeItem(getStorageKey(subdomain));
  } catch {
    // ignore
  }
}

export function ApplicationWizard({ subdomain }: Props) {
  const [currentStep, setCurrentStep] = useState(1);
  const [applicationId, setApplicationId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitResult, setSubmitResult] = useState<{
    qualScore: string;
    summary: string;
  } | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const form = useForm<ApplicationFormData>({
    defaultValues: DEFAULT_VALUES,
    mode: 'onTouched',
  });

  // Hydrate from localStorage on mount
  useEffect(() => {
    const saved = loadState(subdomain);
    if (saved) {
      if (saved.formData) {
        form.reset({ ...DEFAULT_VALUES, ...saved.formData });
      }
      if (saved.applicationId) setApplicationId(saved.applicationId);
      if (saved.currentStep) setCurrentStep(saved.currentStep);
    }
    setHydrated(true);
    console.log('[analytics]', 'application_started', { subdomain });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subdomain]);

  const persistLocal = useCallback(
    (step: number) => {
      const formData = form.getValues();
      saveState(subdomain, {
        applicationId,
        currentStep: step,
        formData,
      });
    },
    [applicationId, form, subdomain]
  );

  const autosaveToServer = useCallback(
    async (step: number) => {
      if (!applicationId) return;
      try {
        const formData = form.getValues();
        const applicantData = {
          legalName: formData.legalName,
          email: formData.email,
          phone: formData.phone,
          dateOfBirth: formData.dateOfBirth,
          idLastFour: formData.idLastFour,
          currentAddress: formData.currentAddress,
          housingStatus: formData.housingStatus,
          currentPayment: formData.currentPayment ? Number(formData.currentPayment) : undefined,
          lengthAtAddress: formData.lengthAtAddress,
          reasonForMoving: formData.reasonForMoving,
          adultsOnApp: formData.adultsOnApp ? Number(formData.adultsOnApp) : undefined,
          children: formData.children ? Number(formData.children) : undefined,
          roommates: formData.roommates ? Number(formData.roommates) : undefined,
          emergencyContactName: formData.emergencyContactName,
          emergencyContactPhone: formData.emergencyContactPhone,
          employmentStatus: formData.employmentStatus,
          employerName: formData.employerName,
          monthlyGrossIncome: formData.monthlyGrossIncome ? Number(formData.monthlyGrossIncome) : undefined,
          additionalIncome: formData.additionalIncome ? Number(formData.additionalIncome) : undefined,
          currentLandlordName: formData.currentLandlordName,
          currentLandlordPhone: formData.currentLandlordPhone,
          prevLandlordName: formData.prevLandlordName,
          prevLandlordPhone: formData.prevLandlordPhone,
          rentPaidOnTime: formData.rentPaidOnTime,
          latePayments: formData.latePayments ? Number(formData.latePayments) : undefined,
          leaseViolations: formData.leaseViolations,
          referencePermission: formData.referencePermission,
          priorEvictions: formData.priorEvictions,
          outstandingBalances: formData.outstandingBalances,
          bankruptcy: formData.bankruptcy,
          backgroundConsent: formData.backgroundConsent,
          hasPets: formData.hasPets,
          petDetails: formData.petDetails,
          smokingDeclaration: formData.smokingDeclaration,
          screeningConsent: formData.screeningConsent,
          truthCertification: formData.truthCertification,
          electronicSignature: formData.electronicSignature,
        };

        await fetch(`/api/applications/${applicationId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            subdomain,
            step,
            applicantData,
            propertyAddress: formData.propertyAddress,
            unitType: formData.unitType,
            targetMoveIn: formData.targetMoveIn,
            monthlyRent: formData.monthlyRent ? Number(formData.monthlyRent) : undefined,
            leaseTerm: formData.leaseTerm,
            occupantCount: formData.occupantCount ? Number(formData.occupantCount) : undefined,
          }),
        });
      } catch {
        // Non-blocking autosave — don't surface errors to user
      }
    },
    [applicationId, form, subdomain]
  );

  const createDraft = useCallback(async () => {
    const formData = form.getValues();
    try {
      setIsSaving(true);
      const res = await fetch('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subdomain,
          propertyAddress: formData.propertyAddress,
          unitType: formData.unitType,
          targetMoveIn: formData.targetMoveIn,
          monthlyRent: formData.monthlyRent ? Number(formData.monthlyRent) : undefined,
          leaseTerm: formData.leaseTerm,
          occupantCount: formData.occupantCount ? Number(formData.occupantCount) : undefined,
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as { id: string };
        setApplicationId(data.id);
        return data.id;
      }
    } catch {
      // Silently continue — local state still saved
    } finally {
      setIsSaving(false);
    }
    return null;
  }, [form, subdomain]);

  const handleNext = useCallback(async () => {
    const fieldsToValidate = STEP_FIELDS[currentStep - 1];
    if (fieldsToValidate.length > 0) {
      const valid = await form.trigger(fieldsToValidate);
      if (!valid) return;
    }

    const nextStep = currentStep + 1;

    // Step 1 completion: create server-side draft
    if (currentStep === 1 && !applicationId) {
      const newId = await createDraft();
      const state: PersistedAppState = {
        applicationId: newId,
        currentStep: nextStep,
        formData: form.getValues(),
      };
      saveState(subdomain, state);
    } else {
      persistLocal(nextStep);
      // Debounced server autosave
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = setTimeout(() => {
        autosaveToServer(currentStep);
      }, 800);
    }

    console.log('[analytics]', 'step_completed', {
      step: currentStep,
      stepName: STEPS[currentStep - 1].label,
    });

    setCurrentStep(nextStep);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [
    applicationId,
    autosaveToServer,
    createDraft,
    currentStep,
    form,
    persistLocal,
    subdomain,
  ]);

  const handleBack = useCallback(() => {
    const prevStep = currentStep - 1;
    persistLocal(prevStep);
    setCurrentStep(prevStep);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [currentStep, persistLocal]);

  const handleSubmit = useCallback(async () => {
    const valid = await form.trigger(['electronicSignature']);
    if (!valid) return;

    const formData = form.getValues();
    if (!formData.screeningConsent || !formData.truthCertification) {
      form.setError('screeningConsent', {
        message: 'You must agree to both statements to submit.',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      // Ensure we have a server-side record
      let appId = applicationId;
      if (!appId) {
        appId = await createDraft();
      }

      if (!appId) {
        throw new Error('Could not create application record');
      }

      // Final autosave of all data
      await autosaveToServer(7);

      // Submit
      const res = await fetch(`/api/applications/${appId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subdomain }),
      });

      if (!res.ok) {
        const err = (await res.json()) as { error: string };
        throw new Error(err.error ?? 'Submission failed');
      }

      const result = (await res.json()) as { qualScore: string; summary: string };
      setSubmitResult(result);
      setSubmitted(true);
      clearState(subdomain);
    } catch (err) {
      form.setError('root', {
        message:
          err instanceof Error
            ? err.message
            : 'Something went wrong. Please try again.',
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [applicationId, autosaveToServer, createDraft, form, subdomain]);

  if (!hydrated) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={24} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (submitted) {
    return <SuccessScreen qualScore={submitResult?.qualScore} />;
  }

  const StepComponent = STEPS[currentStep - 1].component;

  return (
    <div className="space-y-6">
      {/* Progress indicator */}
      <div className="space-y-3">
        {/* Step pills — desktop */}
        <div className="hidden sm:flex gap-1">
          {STEPS.map((step, idx) => {
            const stepNum = idx + 1;
            const isDone = stepNum < currentStep;
            const isActive = stepNum === currentStep;
            return (
              <div
                key={step.label}
                className={`flex-1 h-1.5 rounded-full transition-colors ${
                  isDone
                    ? 'bg-primary'
                    : isActive
                    ? 'bg-primary/50'
                    : 'bg-border'
                }`}
              />
            );
          })}
        </div>

        {/* Step counter */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Step {currentStep} of {TOTAL_STEPS} ·{' '}
            <span className="font-medium text-foreground">
              {STEPS[currentStep - 1].label}
            </span>
          </p>
          {isSaving && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 size={12} className="animate-spin" />
              Saving…
            </span>
          )}
        </div>
      </div>

      {/* Step content */}
      <div className="bg-card border border-border rounded-xl p-5 md:p-6 shadow-sm">
        <StepComponent form={form} />

        {/* Root error */}
        {form.formState.errors.root && (
          <p className="mt-4 text-sm text-destructive bg-destructive/10 rounded-lg px-4 py-3">
            {form.formState.errors.root.message}
          </p>
        )}
      </div>

      {/* Navigation */}
      <div className="flex gap-3">
        {currentStep > 1 && (
          <Button
            type="button"
            variant="outline"
            onClick={handleBack}
            className="flex-none"
          >
            <ChevronLeft size={16} />
            Back
          </Button>
        )}

        {currentStep < TOTAL_STEPS ? (
          <Button
            type="button"
            onClick={handleNext}
            disabled={isSaving}
            className="flex-1"
          >
            {isSaving ? (
              <Loader2 size={16} className="animate-spin" />
            ) : null}
            Continue
            <ChevronRight size={16} />
          </Button>
        ) : (
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="flex-1"
          >
            {isSubmitting ? (
              <Loader2 size={16} className="animate-spin" />
            ) : null}
            {isSubmitting ? 'Submitting…' : 'Submit Application'}
          </Button>
        )}
      </div>

      <p className="text-center text-xs text-muted-foreground">
        Your progress is saved automatically.
      </p>
    </div>
  );
}

function SuccessScreen({ qualScore }: { qualScore?: string }) {
  return (
    <div className="flex flex-col items-center text-center py-12 space-y-4">
      <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
        <CheckCircle2 size={32} className="text-primary" />
      </div>
      <h2 className="text-2xl font-semibold">Application submitted</h2>
      <p className="text-muted-foreground max-w-sm">
        Your application has been received. The agent will be in touch shortly
        to confirm next steps and collect your documents.
      </p>
      {qualScore && (
        <p className="text-xs text-muted-foreground">
          Application reference received successfully.
        </p>
      )}
    </div>
  );
}
