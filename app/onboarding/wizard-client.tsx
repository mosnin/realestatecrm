'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import { BrandLogo } from '@/components/brand-logo';
import { protocol, rootDomain } from '@/lib/utils';
import {
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Copy,
  ExternalLink,
  ClipboardCheck,
  Users,
  Zap,
  Link2,
  Bell,
  Eye,
  Loader2
} from 'lucide-react';
import { toast } from 'sonner';

const TOTAL_STEPS = 7;

const STEP_META = [
  { title: 'Welcome', percent: 14 },
  { title: 'Profile basics', percent: 28 },
  { title: 'Public intake link', percent: 42 },
  { title: 'Application flow', percent: 57 },
  { title: 'Notifications', percent: 71 },
  { title: 'CRM preview', percent: 85 },
  { title: 'Go live', percent: 100 }
];

interface OnboardingState {
  step: number;
  completed: boolean;
  user: {
    id: string;
    name: string | null;
    email: string;
  } | null;
  space: {
    id: string;
    subdomain: string;
    name: string;
    settings: {
      businessName?: string | null;
      phoneNumber?: string | null;
      intakePageTitle?: string | null;
      intakePageIntro?: string | null;
      notifications?: boolean;
    } | null;
  } | null;
}

interface WizardProps {
  initialState: OnboardingState;
  clerkName: string | null;
  clerkEmail: string;
}

function ProgressBar({ step }: { step: number }) {
  const meta = STEP_META[step - 1];
  return (
    <div className="w-full space-y-2 mb-8">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{meta.title}</span>
        <span>Step {step} of {TOTAL_STEPS}</span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all duration-500"
          style={{ width: `${meta.percent}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground text-right">{meta.percent}% complete</p>
    </div>
  );
}

// Step 1: Welcome
function StepWelcome({ onNext }: { onNext: () => void }) {
  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
          <Zap size={20} className="text-primary" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Get your leasing intake workflow live</h1>
        <p className="text-muted-foreground leading-relaxed">
          We&apos;ll set up your intake link, application flow, and CRM in a few steps.
          Takes about 3 minutes.
        </p>
      </div>

      <div className="space-y-3">
        {[
          { icon: Link2, text: 'A shareable intake link renters can fill out' },
          { icon: Users, text: 'Submissions flow directly into your CRM' },
          { icon: Bell, text: 'Notifications when new leads arrive' }
        ].map(({ icon: Icon, text }) => (
          <div key={text} className="flex items-center gap-3 text-sm text-muted-foreground">
            <Icon size={16} className="text-primary flex-shrink-0" />
            {text}
          </div>
        ))}
      </div>

      <Button onClick={onNext} className="w-full" size="lg">
        Get started <ArrowRight size={16} className="ml-2" />
      </Button>
    </div>
  );
}

// Step 2: Profile basics
function StepProfile({
  onNext,
  onBack,
  initialName,
  initialEmail,
  initialPhone,
  initialBusiness,
  spaceExists,
  onSave
}: {
  onNext: () => void;
  onBack: () => void;
  initialName: string;
  initialEmail: string;
  initialPhone: string;
  initialBusiness: string;
  spaceExists: boolean;
  onSave: (data: { name: string; phone: string; businessName: string }) => Promise<void>;
}) {
  const [name, setName] = useState(initialName);
  const [phone, setPhone] = useState(initialPhone);
  const [business, setBusiness] = useState(initialBusiness);
  const [saving, setSaving] = useState(false);

  async function handleNext() {
    if (!name.trim() || !phone.trim() || !business.trim()) return;
    setSaving(true);
    try {
      await onSave({ name, phone, businessName: business });
      onNext();
    } finally {
      setSaving(false);
    }
  }

  const canContinue = name.trim() && phone.trim() && business.trim();

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-xl font-bold">Your profile</h2>
        <p className="text-sm text-muted-foreground">
          This info appears on your intake page and keeps your leads organized.
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="fullName">Full name</Label>
          <Input
            id="fullName"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Alex Preston"
            required
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="business">Business or brand name</Label>
          <Input
            id="business"
            value={business}
            onChange={(e) => setBusiness(e.target.value)}
            placeholder="Preston Leasing"
            required
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" value={initialEmail} disabled className="text-muted-foreground" />
          <p className="text-xs text-muted-foreground">Managed via your account</p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="phone">Phone number</Label>
          <Input
            id="phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="(555) 123-4567"
            required
          />
        </div>
      </div>

      <div className="flex gap-3">
        <Button variant="outline" onClick={onBack} className="flex-1">
          <ArrowLeft size={16} className="mr-2" /> Back
        </Button>
        <Button onClick={handleNext} disabled={!canContinue || saving} className="flex-1">
          {saving ? <Loader2 size={16} className="mr-2 animate-spin" /> : null}
          {saving ? 'Saving...' : 'Continue'}
          {!saving ? <ArrowRight size={16} className="ml-2" /> : null}
        </Button>
      </div>
    </div>
  );
}

// Step 3: Public intake link
function StepIntakeLink({
  onNext,
  onBack,
  initialSlug,
  initialTitle,
  initialIntro,
  businessName,
  spaceExists,
  onCreateSpace
}: {
  onNext: (subdomain: string) => void;
  onBack: () => void;
  initialSlug: string;
  initialTitle: string;
  initialIntro: string;
  businessName: string;
  spaceExists: boolean;
  onCreateSpace: (data: {
    subdomain: string;
    intakePageTitle: string;
    intakePageIntro: string;
    businessName: string;
  }) => Promise<{ subdomain: string }>;
}) {
  const [slug, setSlug] = useState(initialSlug);
  const [title, setTitle] = useState(initialTitle || 'Rental Application');
  const [intro, setIntro] = useState(
    initialIntro || "Share a few details so I can review your rental fit faster."
  );
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(spaceExists ? true : null);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const checkSlug = useCallback(async (value: string) => {
    if (spaceExists) return;
    if (value.length < 3) { setSlugAvailable(null); return; }
    setChecking(true);
    try {
      const res = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'check_slug', slug: value })
      });
      const data = await res.json();
      setSlugAvailable(data.available);
    } finally {
      setChecking(false);
    }
  }, [spaceExists]);

  useEffect(() => {
    const timer = setTimeout(() => checkSlug(slug), 400);
    return () => clearTimeout(timer);
  }, [slug, checkSlug]);

  const previewUrl = `${protocol}://${rootDomain}/apply/${slug || 'your-slug'}`;

  async function handleNext() {
    if (!slug || !title || slugAvailable === false) return;
    setSaving(true);
    setError('');
    try {
      const { subdomain } = await onCreateSpace({
        subdomain: slug,
        intakePageTitle: title,
        intakePageIntro: intro,
        businessName
      });
      onNext(subdomain);
    } catch (e: any) {
      setError(e.message || 'Something went wrong. Try a different slug.');
    } finally {
      setSaving(false);
    }
  }

  const canContinue = slug.length >= 3 && title.trim() && (slugAvailable === true) && !saving;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-xl font-bold">Your intake link</h2>
        <p className="text-sm text-muted-foreground">
          This is the link renters fill out. Share it anywhere.
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="slug">Link slug</Label>
          <div className="relative">
            <Input
              id="slug"
              value={slug}
              onChange={(e) =>
                setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))
              }
              placeholder="preston-leasing"
              disabled={spaceExists}
              className="pr-8"
            />
            {!spaceExists && slug.length >= 3 && (
              <div className="absolute right-2 top-1/2 -translate-y-1/2">
                {checking ? (
                  <Loader2 size={14} className="animate-spin text-muted-foreground" />
                ) : slugAvailable === true ? (
                  <CheckCircle2 size={14} className="text-green-500" />
                ) : slugAvailable === false ? (
                  <span className="text-red-500 text-xs">taken</span>
                ) : null}
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground break-all">{previewUrl}</p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="pageTitle">Page title</Label>
          <Input
            id="pageTitle"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Rental Application"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="introLine">Intro line</Label>
          <Input
            id="introLine"
            value={intro}
            onChange={(e) => setIntro(e.target.value)}
            placeholder="Share a few details so I can review your rental fit faster."
          />
        </div>

        {/* Live preview */}
        <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Preview</p>
          <p className="font-semibold text-sm">{title || 'Rental Application'}</p>
          <p className="text-xs text-muted-foreground">{intro || 'Your intro line here.'}</p>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      <div className="flex gap-3">
        <Button variant="outline" onClick={onBack} className="flex-1">
          <ArrowLeft size={16} className="mr-2" /> Back
        </Button>
        <Button onClick={handleNext} disabled={!canContinue} className="flex-1">
          {saving ? <Loader2 size={16} className="mr-2 animate-spin" /> : null}
          {saving ? 'Creating...' : 'Create link'}
          {!saving ? <ArrowRight size={16} className="ml-2" /> : null}
        </Button>
      </div>
    </div>
  );
}

// Step 4: Application flow preset
function StepAppFlow({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-xl font-bold">Application flow</h2>
        <p className="text-sm text-muted-foreground">
          We attach the default renter intake form automatically. No setup needed.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center flex-shrink-0">
            <CheckCircle2 size={16} className="text-green-600" />
          </div>
          <div>
            <p className="text-sm font-medium">Renter intake form</p>
            <p className="text-xs text-muted-foreground">Name, contact, budget, timeline, areas</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center flex-shrink-0">
            <CheckCircle2 size={16} className="text-green-600" />
          </div>
          <div>
            <p className="text-sm font-medium">Connected to your intake link</p>
            <p className="text-xs text-muted-foreground">Submissions go straight to Leads</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center flex-shrink-0">
            <CheckCircle2 size={16} className="text-green-600" />
          </div>
          <div>
            <p className="text-sm font-medium">CRM ready</p>
            <p className="text-xs text-muted-foreground">Each submission creates a contact record</p>
          </div>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        You can customize form fields later in settings.
      </p>

      <div className="flex gap-3">
        <Button variant="outline" onClick={onBack} className="flex-1">
          <ArrowLeft size={16} className="mr-2" /> Back
        </Button>
        <Button onClick={onNext} className="flex-1">
          Looks good <ArrowRight size={16} className="ml-2" />
        </Button>
      </div>
    </div>
  );
}

// Step 5: Notifications
function StepNotifications({
  onNext,
  onBack,
  initialEmail,
  onSave
}: {
  onNext: () => void;
  onBack: () => void;
  initialEmail: boolean;
  onSave: (data: { emailNotifications: boolean; defaultSubmissionStatus: string }) => Promise<void>;
}) {
  const [emailOn, setEmailOn] = useState(initialEmail);
  const [dashOn, setDashOn] = useState(true);
  const [saving, setSaving] = useState(false);

  async function handleNext() {
    setSaving(true);
    try {
      await onSave({ emailNotifications: emailOn, defaultSubmissionStatus: 'New' });
      onNext();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-xl font-bold">Notifications</h2>
        <p className="text-sm text-muted-foreground">
          Choose how you want to know when a new lead comes in.
        </p>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between py-3 border-b border-border">
          <div>
            <p className="text-sm font-medium">Email notifications</p>
            <p className="text-xs text-muted-foreground">Get an email for each new submission</p>
          </div>
          <Switch checked={emailOn} onCheckedChange={setEmailOn} />
        </div>

        <div className="flex items-center justify-between py-3 border-b border-border">
          <div>
            <p className="text-sm font-medium">Dashboard badge</p>
            <p className="text-xs text-muted-foreground">Unread count in the sidebar</p>
          </div>
          <Switch checked={dashOn} onCheckedChange={setDashOn} />
        </div>

        <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1">
          <p className="text-xs font-medium">Default lead status</p>
          <p className="text-sm">New</p>
          <p className="text-xs text-muted-foreground">All submissions start as &ldquo;New&rdquo;. Change them in the CRM.</p>
        </div>
      </div>

      <div className="flex gap-3">
        <Button variant="outline" onClick={onBack} className="flex-1">
          <ArrowLeft size={16} className="mr-2" /> Back
        </Button>
        <Button onClick={handleNext} disabled={saving} className="flex-1">
          {saving ? <Loader2 size={16} className="mr-2 animate-spin" /> : null}
          {saving ? 'Saving...' : 'Continue'}
          {!saving ? <ArrowRight size={16} className="ml-2" /> : null}
        </Button>
      </div>
    </div>
  );
}

// Step 6: CRM Preview
function StepCRMPreview({
  onNext,
  onBack,
  subdomain,
  businessName
}: {
  onNext: () => void;
  onBack: () => void;
  subdomain: string;
  businessName: string;
}) {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-xl font-bold">This is what you&apos;ll see</h2>
        <p className="text-sm text-muted-foreground">
          Every submission lands as a lead card in your CRM.
        </p>
      </div>

      {/* Mock lead card */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-semibold">Jordan Reyes</p>
            <p className="text-xs text-muted-foreground">Applied via intake link • just now</p>
          </div>
          <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full px-2 py-0.5 font-medium flex-shrink-0">
            New
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded bg-muted/40 px-2 py-1.5">
            <p className="text-muted-foreground">Phone</p>
            <p className="font-medium">(555) 987-6543</p>
          </div>
          <div className="rounded bg-muted/40 px-2 py-1.5">
            <p className="text-muted-foreground">Budget</p>
            <p className="font-medium">$2,800/mo</p>
          </div>
          <div className="rounded bg-muted/40 px-2 py-1.5">
            <p className="text-muted-foreground">Move-in</p>
            <p className="font-medium">Aug 1</p>
          </div>
          <div className="rounded bg-muted/40 px-2 py-1.5">
            <p className="text-muted-foreground">Areas</p>
            <p className="font-medium">Midtown, Uptown</p>
          </div>
        </div>

        <div className="rounded bg-muted/40 px-2 py-1.5 text-xs">
          <p className="text-muted-foreground">Notes</p>
          <p className="mt-0.5">Looking for pet-friendly 2BR. Flexible on start date if needed.</p>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Your full lead list lives in the Leads tab. Filter, update status, and reach out from there.
      </p>

      <div className="flex gap-3">
        <Button variant="outline" onClick={onBack} className="flex-1">
          <ArrowLeft size={16} className="mr-2" /> Back
        </Button>
        <Button onClick={onNext} className="flex-1">
          Ready to go live <ArrowRight size={16} className="ml-2" />
        </Button>
      </div>
    </div>
  );
}

// Step 7: Go Live
function StepGoLive({
  subdomain,
  onComplete
}: {
  subdomain: string;
  onComplete: () => void;
}) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [completing, setCompleting] = useState(false);
  const intakeUrl = `${protocol}://${rootDomain}/apply/${subdomain}`;

  async function copyLink() {
    await navigator.clipboard.writeText(intakeUrl);
    setCopied(true);
    toast.success('Link copied!');
    setTimeout(() => setCopied(false), 2500);
  }

  async function handleGoToCRM() {
    setCompleting(true);
    await onComplete();
    router.push(`/s/${subdomain}`);
  }

  async function handleTestApp() {
    await onComplete();
    window.open(`/apply/${subdomain}`, '_blank');
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
          <CheckCircle2 size={20} className="text-green-600" />
        </div>
        <h2 className="text-xl font-bold">Your intake link is live</h2>
        <p className="text-sm text-muted-foreground">
          Share it anywhere and submissions will flow into your CRM.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
        <p className="text-xs text-muted-foreground font-medium">Your intake link</p>
        <code className="text-xs break-all block">{intakeUrl}</code>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Button variant="outline" onClick={copyLink} className="gap-2 text-sm">
          {copied ? <ClipboardCheck size={15} /> : <Copy size={15} />}
          {copied ? 'Copied!' : 'Copy link'}
        </Button>
        <Button variant="outline" asChild className="gap-2 text-sm">
          <a href={`/apply/${subdomain}`} target="_blank" rel="noreferrer">
            <ExternalLink size={15} /> Preview form
          </a>
        </Button>
        <Button variant="outline" onClick={handleTestApp} className="gap-2 text-sm col-span-2">
          <Eye size={15} /> Submit a test application
        </Button>
      </div>

      <p className="text-xs text-muted-foreground border-t border-border pt-4">
        Add this link to your bio, ad replies, DMs, or email follow-ups.
        New submissions show up instantly in Leads.
      </p>

      <Button onClick={handleGoToCRM} disabled={completing} className="w-full" size="lg">
        {completing ? <Loader2 size={16} className="mr-2 animate-spin" /> : null}
        {completing ? 'Opening CRM...' : 'Go to my CRM'}
        {!completing ? <ArrowRight size={16} className="ml-2" /> : null}
      </Button>
    </div>
  );
}

export function OnboardingWizard({ initialState, clerkName, clerkEmail }: WizardProps) {
  const [step, setStep] = useState(initialState.step ?? 1);
  const [subdomain, setSubdomain] = useState(initialState.space?.subdomain ?? '');
  const [businessName, setBusinessName] = useState(
    initialState.space?.settings?.businessName ?? ''
  );

  // Prefill profile defaults
  const prefillName = initialState.user?.name ?? clerkName ?? '';
  const prefillEmail = initialState.user?.email ?? clerkEmail;
  const prefillPhone = initialState.space?.settings?.phoneNumber ?? '';
  const prefillSlug = initialState.space?.subdomain ?? '';
  const prefillTitle = initialState.space?.settings?.intakePageTitle ?? '';
  const prefillIntro = initialState.space?.settings?.intakePageIntro ?? '';
  const prefillNotifications = initialState.space?.settings?.notifications ?? true;

  async function saveStep(nextStep: number) {
    await fetch('/api/onboarding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'save_step', step: nextStep })
    });
  }

  async function goTo(nextStep: number) {
    await saveStep(nextStep);
    setStep(nextStep);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleProfileSave(data: { name: string; phone: string; businessName: string }) {
    setBusinessName(data.businessName);
    await fetch('/api/onboarding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'save_profile',
        name: data.name,
        phoneNumber: data.phone,
        businessName: data.businessName
      })
    });
  }

  async function handleCreateSpace(data: {
    subdomain: string;
    intakePageTitle: string;
    intakePageIntro: string;
    businessName: string;
  }) {
    const res = await fetch('/api/onboarding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create_space', ...data })
    });
    let json: { error?: string; subdomain?: string } = {};
    try {
      json = await res.json();
    } catch {
      throw new Error('Server error — please try again.');
    }
    if (!res.ok) throw new Error(json.error || 'Failed to create intake link');
    setSubdomain(json.subdomain ?? data.subdomain);
    return { subdomain: json.subdomain ?? data.subdomain };
  }

  async function handleNotificationsSave(data: {
    emailNotifications: boolean;
    defaultSubmissionStatus: string;
  }) {
    await fetch('/api/onboarding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'save_notifications', ...data })
    });
  }

  async function handleComplete() {
    await fetch('/api/onboarding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'complete' })
    });
  }

  return (
    <div className="min-h-screen bg-background flex items-start justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-8">
          <BrandLogo className="h-7" alt="Chippi" />
        </div>

        <Card className="border border-border">
          <CardContent className="p-6 md:p-8">
            <ProgressBar step={step} />

            {step === 1 && (
              <StepWelcome onNext={() => goTo(2)} />
            )}

            {step === 2 && (
              <StepProfile
                onNext={() => goTo(3)}
                onBack={() => goTo(1)}
                initialName={prefillName}
                initialEmail={prefillEmail}
                initialPhone={prefillPhone}
                initialBusiness={businessName || prefillName.split(' ')[0] + ' Leasing'}
                spaceExists={!!initialState.space}
                onSave={handleProfileSave}
              />
            )}

            {step === 3 && (
              <StepIntakeLink
                onNext={(sub) => { setSubdomain(sub); goTo(4); }}
                onBack={() => goTo(2)}
                initialSlug={subdomain || prefillSlug}
                initialTitle={prefillTitle}
                initialIntro={prefillIntro}
                businessName={businessName}
                spaceExists={!!initialState.space || !!subdomain}
                onCreateSpace={handleCreateSpace}
              />
            )}

            {step === 4 && (
              <StepAppFlow
                onNext={() => goTo(5)}
                onBack={() => goTo(3)}
              />
            )}

            {step === 5 && (
              <StepNotifications
                onNext={() => goTo(6)}
                onBack={() => goTo(4)}
                initialEmail={prefillNotifications}
                onSave={handleNotificationsSave}
              />
            )}

            {step === 6 && (
              <StepCRMPreview
                onNext={() => goTo(7)}
                onBack={() => goTo(5)}
                subdomain={subdomain}
                businessName={businessName}
              />
            )}

            {step === 7 && (
              <StepGoLive
                subdomain={subdomain}
                onComplete={handleComplete}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
