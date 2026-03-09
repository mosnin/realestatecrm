'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Copy, ExternalLink, Loader2 } from 'lucide-react';
import { protocol, rootDomain } from '@/lib/utils';
import {
  checkSlugAvailabilityAction,
  completeOnboardingAction,
  completePreviewStepAction,
  completeTemplateStepAction,
  saveProfileBasicsAction,
  saveRoutingStepAction,
  setupIntakeLinkAction,
  startOnboardingAction
} from './actions';

type Props = {
  initialStep: number;
  initialProfile: {
    fullName: string;
    businessName: string;
    email: string;
    phone: string;
  };
  initialWorkspace: {
    slug: string;
    displayTitle: string;
    introLine: string;
  };
  initialNotifications: boolean;
};

const steps = [
  'Welcome',
  'Profile',
  'Intake link',
  'Template',
  'Routing',
  'CRM preview',
  'Success'
];

export function OnboardingWizard({
  initialStep,
  initialProfile,
  initialWorkspace,
  initialNotifications
}: Props) {
  const router = useRouter();
  const [step, setStep] = useState(initialStep);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [fullName, setFullName] = useState(initialProfile.fullName);
  const [businessName, setBusinessName] = useState(initialProfile.businessName);
  const [email, setEmail] = useState(initialProfile.email);
  const [phone, setPhone] = useState(initialProfile.phone);

  const [slug, setSlug] = useState(initialWorkspace.slug);
  const [displayTitle, setDisplayTitle] = useState(initialWorkspace.displayTitle);
  const [introLine, setIntroLine] = useState(initialWorkspace.introLine);
  const [slugState, setSlugState] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');

  const [notifications, setNotifications] = useState(initialNotifications);

  const intakeLink = useMemo(() => `${protocol}://${rootDomain}/apply/${slug || 'your-slug'}`, [slug]);

  useEffect(() => {
    startOnboardingAction().catch(() => null);
  }, []);

  useEffect(() => {
    if (!slug) {
      setSlugState('idle');
      return;
    }

    const id = setTimeout(() => {
      setSlugState('checking');
      checkSlugAvailabilityAction(slug)
        .then((res) => {
          setSlug(res.normalized);
          setSlugState(res.available ? 'available' : 'taken');
        })
        .catch(() => setSlugState('idle'));
    }, 300);

    return () => clearTimeout(id);
  }, [slug]);

  function moveTo(next: number) {
    setError(null);
    setStep(next);
  }

  function onCopyLink() {
    navigator.clipboard.writeText(intakeLink);
    console.log('[analytics]', 'intake_link_copied', { intakeLink });
  }

  function openPreview() {
    console.log('[analytics]', 'form_preview_opened', { intakeLink });
    window.open(intakeLink, '_blank', 'noopener,noreferrer');
  }

  function openTestSubmission() {
    console.log('[analytics]', 'test_submission_started', { intakeLink });
    window.open(`${intakeLink}?test=1`, '_blank', 'noopener,noreferrer');
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Get your renter intake live</CardTitle>
        <CardDescription>
          Step {step} of 7 — we&apos;ll launch your branded intake flow and route submissions into your CRM.
        </CardDescription>
        <div className="flex gap-2 flex-wrap pt-2">
          {steps.map((label, i) => (
            <Badge key={label} variant={i + 1 <= step ? 'default' : 'secondary'}>
              {i + 1}. {label}
            </Badge>
          ))}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {step === 1 && (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">Welcome to Chippi</h2>
            <p className="text-sm text-muted-foreground">
              In the next few minutes, you&apos;ll publish your intake link and start receiving structured renter applications directly in your CRM.
            </p>
            <Button onClick={() => moveTo(2)}>Continue</Button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="grid gap-3">
              <Label>Full name</Label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
              <Label>Business or brand name (optional)</Label>
              <Input value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
              <Label>Contact email</Label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
              <Label>Mobile phone (optional)</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button
              disabled={pending || !fullName || !email}
              onClick={() =>
                startTransition(async () => {
                  try {
                    await saveProfileBasicsAction({ fullName, businessName, email, phone });
                    moveTo(3);
                  } catch (err) {
                    setError(err instanceof Error ? err.message : 'Failed to save profile');
                  }
                })
              }
            >
              {pending ? <Loader2 className="animate-spin" /> : 'Save and continue'}
            </Button>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <div className="grid gap-3">
              <Label>Preferred public slug</Label>
              <Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="my-rentals" />
              <Label>Display title</Label>
              <Input value={displayTitle} onChange={(e) => setDisplayTitle(e.target.value)} placeholder="Acme Realty Leasing" />
              <Label>Short intro line</Label>
              <Input value={introLine} onChange={(e) => setIntroLine(e.target.value)} placeholder="Fast, professional application review." />
            </div>
            <div className="rounded-md border p-3 text-sm">
              <p className="font-medium">Link preview</p>
              <code className="text-xs text-muted-foreground">{intakeLink}</code>
              <p className="mt-2 text-xs">
                {slugState === 'checking' && 'Checking slug...'}
                {slugState === 'available' && 'Slug is available.'}
                {slugState === 'taken' && 'Slug is already taken.'}
              </p>
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button
              disabled={pending || !slug || slugState === 'taken'}
              onClick={() =>
                startTransition(async () => {
                  const res = await setupIntakeLinkAction({ slug, displayTitle, introLine });
                  if (!res.success) {
                    setError(res.error);
                    return;
                  }
                  moveTo(4);
                })
              }
            >
              {pending ? <Loader2 className="animate-spin" /> : 'Generate intake link'}
            </Button>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <h3 className="font-semibold">Default renter application template is ready</h3>
            <p className="text-sm text-muted-foreground">
              Chippi preconfigures the full 7-step renter application flow so you can launch immediately.
            </p>
            <Button
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  await completeTemplateStepAction();
                  moveTo(5);
                })
              }
            >
              Continue
            </Button>
          </div>
        )}

        {step === 5 && (
          <div className="space-y-4">
            <h3 className="font-semibold">Notifications and routing</h3>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <p className="text-sm font-medium">Email/dashboard notifications</p>
                <p className="text-xs text-muted-foreground">Get notified when a renter submits.</p>
              </div>
              <Switch checked={notifications} onCheckedChange={setNotifications} />
            </div>
            <p className="text-sm text-muted-foreground">
              Submissions automatically create CRM records in your Applications view.
            </p>
            <Button
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  await saveRoutingStepAction({ notifications });
                  moveTo(6);
                })
              }
            >
              Save and continue
            </Button>
          </div>
        )}

        {step === 6 && (
          <div className="space-y-4">
            <h3 className="font-semibold">CRM preview</h3>
            <div className="rounded-xl border p-4 space-y-2">
              <p className="font-medium">Taylor Nguyen — 1BR Downtown</p>
              <p className="text-sm text-muted-foreground">Move-in: Apr 15 • Income band: moderate • Score: WARM</p>
              <p className="text-sm">Stable income, complete docs, no prior evictions. Follow up within 24 hours.</p>
            </div>
            <Button
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  await completePreviewStepAction();
                  moveTo(7);
                })
              }
            >
              Looks good
            </Button>
          </div>
        )}

        {step === 7 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle2 size={18} />
              <p className="font-semibold">Your intake link is live</p>
            </div>
            <code className="block rounded-md border p-3 text-xs">{intakeLink}</code>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={onCopyLink}><Copy />Copy link</Button>
              <Button variant="outline" onClick={openPreview}><ExternalLink />Preview form</Button>
              <Button variant="outline" onClick={openTestSubmission}><ExternalLink />Test submission</Button>
              <Button
                onClick={() =>
                  startTransition(async () => {
                    const res = await completeOnboardingAction();
                    if (res.success) {
                      router.push(`/s/${res.subdomain}/applications`);
                      router.refresh();
                    }
                  })
                }
              >
                {pending ? <Loader2 className="animate-spin" /> : 'Go to CRM'}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              When a renter submits, Chippi saves the application, scores it, and creates a CRM card for follow-up.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
