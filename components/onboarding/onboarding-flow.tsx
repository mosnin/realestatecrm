'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Briefcase, Building2, Clock, GraduationCap, HandCoins, Home, MapPinned, MessageCircle, Share2, Sparkles, TrendingDown, Users2, Wallet } from 'lucide-react';
import { Confetti, type ConfettiRef } from '@/components/ui/confetti';
import { OnboardingShell } from './onboarding-shell';
import { PhotoStep, SlugStep, TextStep, TextareaStep, TilesStep, type TileOption } from './onboarding-steps';

// ── Role ───────────────────────────────────────────────────────────────────

type Role = 'realtor' | 'broker' | 'broker_only';

const ROLE_OPTIONS: TileOption<Role>[] = [
  { value: 'realtor',     label: 'Realtor',            description: 'Solo agent with a pipeline.', icon: Home },
  { value: 'broker',      label: 'Broker + realtor',   description: 'Run a team and sell.',        icon: Briefcase },
  { value: 'broker_only', label: 'Broker only',        description: 'Team lead — no personal pipeline.', icon: Building2 },
];

// ── Shared option sets ─────────────────────────────────────────────────────

const TIMEZONES: TileOption<string>[] = [
  { value: 'America/New_York',    label: 'Eastern',  description: 'New York, Miami, Atlanta' },
  { value: 'America/Chicago',     label: 'Central',  description: 'Chicago, Austin, Dallas' },
  { value: 'America/Denver',      label: 'Mountain', description: 'Denver, Phoenix' },
  { value: 'America/Los_Angeles', label: 'Pacific',  description: 'LA, San Francisco, Seattle' },
  { value: 'America/Anchorage',   label: 'Alaska' },
  { value: 'Pacific/Honolulu',    label: 'Hawaii' },
];

const PAIN_POINTS: TileOption<string>[] = [
  { value: 'lead-followup',  label: 'Lead follow-up', description: 'New leads slip through.', icon: MessageCircle },
  { value: 'scheduling',     label: 'Scheduling',     description: 'Tour bookings + conflicts.', icon: Clock },
  { value: 'pipeline',       label: 'Pipeline',       description: 'Hard to see what\'s moving.', icon: TrendingDown },
  { value: 'paperwork',      label: 'Paperwork',      description: 'Docs, disclosures, offers.', icon: GraduationCap },
];

const HEAR_ABOUT: TileOption<string>[] = [
  { value: 'referral',     label: 'Referral',      icon: Share2 },
  { value: 'google',       label: 'Google search' },
  { value: 'social',       label: 'Social media' },
  { value: 'word',         label: 'Word of mouth' },
  { value: 'other',        label: 'Something else' },
];

const AGENT_COUNT: TileOption<string>[] = [
  { value: '1-5',   label: '1–5' },
  { value: '5-15',  label: '5–15' },
  { value: '15-50', label: '15–50' },
  { value: '50+',   label: '50+' },
];

const BROKERAGE_TYPE: TileOption<string>[] = [
  { value: 'independent', label: 'Independent', icon: Building2 },
  { value: 'franchise',   label: 'Franchise',   icon: Briefcase },
  { value: 'virtual',     label: 'Virtual',     icon: Users2 },
];

const PRIMARY_MARKET: TileOption<string>[] = [
  { value: 'residential_rental', label: 'Residential rental' },
  { value: 'commercial',         label: 'Commercial' },
  { value: 'mixed',              label: 'Mixed' },
];

const COMMISSION_STRUCTURE: TileOption<string>[] = [
  { value: 'flat_fee',          label: 'Flat fee',          icon: Wallet },
  { value: 'percentage_split',  label: 'Percentage split',  icon: HandCoins },
  { value: 'hybrid',            label: 'Hybrid' },
];

// ── Form values ────────────────────────────────────────────────────────────

interface FormValues {
  name: string;
  role: Role | null;
  // Realtor / broker-with-workspace
  businessName: string;
  slug: string;
  realtorPhone: string;
  realtorBio: string;
  logoUrl: string | null;
  // Shared
  timezone: string;
  painPoint: string;
  hearAbout: string;
  // Brokerage
  brokerageName: string;
  brokerWebsiteUrl: string;
  officeAddress: string;
  officePhone: string;
  brokerLogoUrl: string;
  agentCount: string;
  brokerageType: string;
  primaryMarket: string;
  commissionStructure: string;
  geographicCoverage: string;
}

// ── Step sequencing ────────────────────────────────────────────────────────

/**
 * Step ids for the full catalog. Each role path picks a subset in order. A
 * union rather than an enum so typos surface at compile time.
 */
type StepId =
  | 'role'
  | 'name'
  | 'business-name'
  | 'slug'
  | 'phone'
  | 'bio'
  | 'logo'
  | 'timezone'
  | 'pain'
  | 'hear'
  | 'brokerage-name'
  | 'brokerage-address'
  | 'brokerage-phone'
  | 'brokerage-logo'
  | 'brokerage-agent-count'
  | 'brokerage-type'
  | 'brokerage-market'
  | 'brokerage-commission';

/**
 * Compute the step sequence from the chosen role. `role` is always first;
 * the rest flow naturally from there. Steps that don't apply to a role are
 * simply absent from the list — no conditional rendering inside the step
 * machine.
 */
function stepsFor(role: Role | null): StepId[] {
  if (!role) return ['role'];

  const base: StepId[] = ['role', 'name'];
  if (role === 'realtor' || role === 'broker') {
    base.push('business-name', 'slug', 'phone', 'bio', 'logo');
  }
  if (role === 'broker' || role === 'broker_only') {
    base.push(
      'brokerage-name',
      'brokerage-address',
      'brokerage-phone',
      'brokerage-logo',
      'brokerage-agent-count',
      'brokerage-type',
      'brokerage-market',
      'brokerage-commission',
    );
  }
  base.push('timezone', 'pain', 'hear');
  return base;
}

// ── Component ──────────────────────────────────────────────────────────────

interface OnboardingFlowProps {
  defaultName: string;
  userImageUrl?: string;
}

export function OnboardingFlow({ defaultName, userImageUrl }: OnboardingFlowProps) {
  const router = useRouter();
  const confettiRef = useRef<ConfettiRef>(null);
  const [values, setValues] = useState<FormValues>({
    name: defaultName || '',
    role: null,
    businessName: '',
    slug: '',
    realtorPhone: '',
    realtorBio: '',
    logoUrl: userImageUrl || null,
    timezone: '',
    painPoint: '',
    hearAbout: '',
    brokerageName: '',
    brokerWebsiteUrl: '',
    officeAddress: '',
    officePhone: '',
    brokerLogoUrl: '',
    agentCount: '',
    brokerageType: '',
    primaryMarket: '',
    commissionStructure: '',
    geographicCoverage: '',
  });
  const [stepIndex, setStepIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const set = useCallback(
    <K extends keyof FormValues>(key: K, value: FormValues[K]) => {
      setValues((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const steps = useMemo(() => stepsFor(values.role), [values.role]);
  const stepId = steps[stepIndex];
  const totalSteps = steps.length;

  // Last step — once completed, we submit + redirect rather than advance.
  const isLastStep = stepIndex === steps.length - 1;

  const goBack = useCallback(() => {
    setStepIndex((i) => Math.max(0, i - 1));
  }, []);

  const goNext = useCallback(async () => {
    if (!isLastStep) {
      setStepIndex((i) => i + 1);
      return;
    }
    // Last step → finalize.
    await finalize();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLastStep]);

  const checkSlug = useCallback(async (slug: string) => {
    try {
      const res = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'check_slug', slug }),
      });
      if (!res.ok) return { available: false, error: 'Could not check availability' };
      const data = await res.json();
      return { available: !!data.available, error: data.error };
    } catch {
      return { available: false, error: 'Network error' };
    }
  }, []);

  async function finalize() {
    const role = values.role!;
    setSubmitting(true);
    try {
      if (role === 'broker_only') {
        // Broker-only: skip workspace creation.
        const profileRes = await fetch('/api/onboarding', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'save_profile',
            name: values.name.trim(),
            phone: '',
            businessName: values.brokerageName.trim(),
            timezone: values.timezone || undefined,
            hearAbout: values.hearAbout || undefined,
            painPoint: values.painPoint || undefined,
          }),
        });
        if (!profileRes.ok) throw await errorFrom(profileRes);

        const brokerRes = await fetch('/api/broker/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(brokerCreateBody(values)),
        });
        if (!brokerRes.ok) throw await errorFrom(brokerRes);

        const completeRes = await fetch('/api/onboarding', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'complete', accountType: 'broker_only' }),
        });
        if (!completeRes.ok) throw await errorFrom(completeRes);

        confettiRef.current?.fire({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
        await sleep(800);
        router.push('/broker');
        return;
      }

      // Realtor or broker-with-workspace.
      const profileRes = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_profile',
          name: values.name.trim(),
          phone: role === 'realtor' ? values.realtorPhone.trim() : '',
          businessName: values.businessName.trim(),
          bio: role === 'realtor' ? values.realtorBio.trim() || undefined : undefined,
          timezone: values.timezone || undefined,
          hearAbout: values.hearAbout || undefined,
          painPoint: values.painPoint || undefined,
        }),
      });
      if (!profileRes.ok) throw await errorFrom(profileRes);

      const spaceRes = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_space',
          slug: values.slug.trim(),
          intakePageTitle: 'Rental Application',
          intakePageIntro: 'Share a few details so I can review your rental fit faster.',
          businessName: values.businessName.trim(),
          logoUrl: values.logoUrl ?? undefined,
        }),
      });
      const spaceData = await spaceRes.json().catch(() => ({}));
      if (!spaceRes.ok) {
        if (spaceRes.status === 409) {
          toast.error('That slug was just taken. Please pick a different one.');
          setSubmitting(false);
          // Jump back to the slug step so the user can fix it.
          const slugIndex = steps.indexOf('slug');
          if (slugIndex >= 0) setStepIndex(slugIndex);
          return;
        }
        throw new Error(spaceData?.error || 'Failed to create workspace.');
      }

      if (role === 'broker') {
        const brokerRes = await fetch('/api/broker/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(brokerCreateBody(values)),
        });
        const brokerData = await brokerRes.json().catch(() => ({}));
        if (!brokerRes.ok) throw new Error(brokerData?.error || 'Failed to create brokerage.');

        const newBrokerageId = brokerData.brokerage?.id;
        if (newBrokerageId && spaceData?.slug) {
          await fetch('/api/spaces', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ slug: spaceData.slug, brokerageId: newBrokerageId }),
          }).catch(() => undefined);
        }
      }

      const accountType = role === 'broker' ? 'both' : 'realtor';
      const completeRes = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'complete', accountType }),
      });
      if (!completeRes.ok) throw await errorFrom(completeRes);

      confettiRef.current?.fire({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
      await sleep(800);
      if (role === 'broker') {
        router.push('/broker');
      } else {
        const finalSlug: string = spaceData.slug ?? values.slug;
        router.push(`/s/${finalSlug}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong.';
      toast.error(msg);
      setSubmitting(false);
    }
  }

  return (
    <OnboardingShell
      stepIndex={stepIndex}
      totalSteps={totalSteps}
      stepKey={stepId}
      onBack={stepIndex > 0 && !submitting ? goBack : undefined}
    >
      <Confetti ref={confettiRef} manualstart className="pointer-events-none fixed inset-0 z-[9999] h-full w-full" />

      {stepId === 'role' && (
        <TilesStep<Role>
          title="Which best describes you?"
          subtitle="We'll tailor the setup to match."
          options={ROLE_OPTIONS}
          value={values.role}
          onSelect={(v) => set('role', v)}
          columns={3}
          advanceOnSelect
          onNext={() => setStepIndex((i) => i + 1)}
        />
      )}

      {stepId === 'name' && (
        <TextStep
          title="What's your name?"
          label="Full name"
          placeholder="Jane Doe"
          value={values.name}
          onChange={(v) => set('name', v)}
          onNext={goNext}
          required
          maxLength={120}
        />
      )}

      {stepId === 'business-name' && (
        <TextStep
          title="What do you call your business?"
          subtitle="Goes on intake forms, emails, and your public page."
          label="Business or brand name"
          placeholder="Sunset Realty"
          value={values.businessName}
          onChange={(v) => set('businessName', v)}
          onNext={goNext}
          required
          maxLength={120}
        />
      )}

      {stepId === 'slug' && (
        <SlugStep
          title="Pick your intake link"
          subtitle="This is the URL you'll share with new leads."
          value={values.slug}
          onChange={(v) => set('slug', v)}
          onNext={goNext}
          onCheck={checkSlug}
        />
      )}

      {stepId === 'phone' && (
        <TextStep
          title="How can clients reach you?"
          subtitle="Optional — we'll never share this publicly."
          label="Phone number"
          placeholder="(415) 555-0123"
          type="tel"
          value={values.realtorPhone}
          onChange={(v) => set('realtorPhone', v)}
          onNext={goNext}
          onSkip={goNext}
          required={false}
          maxLength={40}
        />
      )}

      {stepId === 'bio' && (
        <TextareaStep
          title="Tell clients a bit about yourself"
          subtitle="Shown on your intake page. Keep it short."
          label="Bio"
          placeholder="15 years helping families land their next home in the Bay Area."
          value={values.realtorBio}
          onChange={(v) => set('realtorBio', v)}
          onNext={goNext}
          onSkip={goNext}
          maxLength={500}
        />
      )}

      {stepId === 'logo' && (
        <PhotoStep
          title="Add a photo or logo"
          subtitle="Shown next to your name. You can update this later."
          value={values.logoUrl}
          onChange={(url) => set('logoUrl', url)}
          onNext={goNext}
          onSkip={goNext}
        />
      )}

      {stepId === 'brokerage-name' && (
        <TextStep
          title="What's your brokerage called?"
          label="Brokerage name"
          placeholder="Sunset Realty Group"
          value={values.brokerageName}
          onChange={(v) => set('brokerageName', v)}
          onNext={goNext}
          required
          maxLength={120}
        />
      )}

      {stepId === 'brokerage-address' && (
        <TextStep
          title="Where's your office?"
          subtitle="Optional."
          label="Office address"
          placeholder="500 Main St, Oakland, CA"
          value={values.officeAddress}
          onChange={(v) => set('officeAddress', v)}
          onNext={goNext}
          onSkip={goNext}
          required={false}
          maxLength={200}
        />
      )}

      {stepId === 'brokerage-phone' && (
        <TextStep
          title="Office phone?"
          label="Office phone"
          placeholder="(415) 555-0199"
          type="tel"
          value={values.officePhone}
          onChange={(v) => set('officePhone', v)}
          onNext={goNext}
          onSkip={goNext}
          required={false}
          maxLength={40}
        />
      )}

      {stepId === 'brokerage-logo' && (
        <PhotoStep
          title="Add your brokerage logo"
          subtitle="Optional — goes on emails and shared packets."
          value={values.brokerLogoUrl || null}
          onChange={(url) => set('brokerLogoUrl', url ?? '')}
          onNext={goNext}
          onSkip={goNext}
        />
      )}

      {stepId === 'brokerage-agent-count' && (
        <TilesStep
          title="How many agents on the team?"
          options={AGENT_COUNT}
          value={values.agentCount || null}
          onSelect={(v) => set('agentCount', v)}
          onNext={goNext}
          columns={4}
          advanceOnSelect
        />
      )}

      {stepId === 'brokerage-type' && (
        <TilesStep
          title="What kind of brokerage are you?"
          options={BROKERAGE_TYPE}
          value={values.brokerageType || null}
          onSelect={(v) => set('brokerageType', v)}
          onNext={goNext}
          columns={3}
          advanceOnSelect
        />
      )}

      {stepId === 'brokerage-market' && (
        <TilesStep
          title="Primary market?"
          options={PRIMARY_MARKET}
          value={values.primaryMarket || null}
          onSelect={(v) => set('primaryMarket', v)}
          onNext={goNext}
          columns={3}
          advanceOnSelect
        />
      )}

      {stepId === 'brokerage-commission' && (
        <TilesStep
          title="How do you structure commission?"
          options={COMMISSION_STRUCTURE}
          value={values.commissionStructure || null}
          onSelect={(v) => set('commissionStructure', v)}
          onNext={goNext}
          columns={3}
          advanceOnSelect
        />
      )}

      {stepId === 'timezone' && (
        <TilesStep
          title="What time zone are you in?"
          options={TIMEZONES}
          value={values.timezone || null}
          onSelect={(v) => set('timezone', v)}
          onNext={goNext}
          columns={3}
          advanceOnSelect
        />
      )}

      {stepId === 'pain' && (
        <TilesStep
          title="Where do you lose the most time today?"
          subtitle="We'll bias the app toward solving this first."
          options={PAIN_POINTS}
          value={values.painPoint || null}
          onSelect={(v) => set('painPoint', v)}
          onNext={goNext}
          columns={4}
          advanceOnSelect
        />
      )}

      {stepId === 'hear' && (
        <TilesStep
          title="How did you hear about Chippi?"
          options={HEAR_ABOUT}
          value={values.hearAbout || null}
          onSelect={(v) => set('hearAbout', v)}
          onNext={goNext}
          columns={3}
          advanceOnSelect={false}
          busy={submitting}
        />
      )}
    </OnboardingShell>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

function brokerCreateBody(v: FormValues) {
  return {
    name: v.brokerageName.trim(),
    logoUrl: v.brokerLogoUrl.trim() || undefined,
    websiteUrl: v.brokerWebsiteUrl.trim() || undefined,
    officeAddress: v.officeAddress.trim() || undefined,
    officePhone: v.officePhone.trim() || undefined,
    agentCount: v.agentCount || undefined,
    brokerageType: v.brokerageType || undefined,
    primaryMarket: v.primaryMarket || undefined,
    commissionStructure: v.commissionStructure || undefined,
    geographicCoverage: v.geographicCoverage.trim() || undefined,
  };
}

async function errorFrom(res: Response) {
  const data = await res.json().catch(() => ({}));
  return new Error(data?.error || `Request failed (${res.status})`);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
