'use client';

/**
 * Realtor onboarding — V2, the storytelling flow.
 *
 * The audit found V1 was a wizard: welcome → data → data → demo →
 * data → static-plan. It collected fields, then summarized the fields.
 * Apple onboarding tells a story — welcome, recognition, trust, then a
 * payoff where the product DOES something for you before you arrive.
 *
 * The arc (9 stages, each one idea):
 *   1. welcome   — "Hi. I'm Chippi." One promise. (unchanged from V1.)
 *   2. name      — name + role. Role auto-advances when name's filled.
 *   3. business  — business name → live slug check.
 *   4. where     — ZIP + tenure. "Continue" CREATES the workspace.
 *   5. promise   — the trust micro-screen. "I draft. You approve."
 *   6. serve     — audience + voice guidance. (shared)
 *   7. voice     — pick warm vs direct from two drafts. (shared)
 *   8. sources   — top 1-2 lead sources. (shared)
 *   9. reveal    — Chippi TYPES a first-touch message in their voice,
 *                  live. The payoff. "Take me in" completes.
 *
 * Gated behind NEXT_PUBLIC_ONBOARDING_V2 (see app/setup/page.tsx).
 * V1 stays the default and the rollback path until this proves out.
 *
 * Persistence mirrors V1:
 *   - End of `where`: save_profile + create_space + save_realtor_profile.
 *   - End of serve/voice/sources: save_realtor_profile upsert (cumulative).
 *   - reveal "take me in": complete → redirect (broker branch for owners).
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, ArrowRight, Check } from 'lucide-react';
import { toast } from 'sonner';
import { normalizeSlug, isValidSlug } from '@/lib/intake';
import { rootDomain } from '@/lib/utils';
import { CHIPPI_PILL } from '@/lib/typography';
import { OnboardingShell } from './onboarding-shell';
import { TypingText } from './typing-text';
import { composeOnboardingDraft } from '@/lib/onboarding-draft';
import {
  type Role, type Tenure, type Tone, type SlugState,
  TENURE_TO_YEARS,
  toggle, toggleCapped,
  Section, PickerButton, StageContinue, ErrorLine,
  StageWhoYouServe, StageVoice, StageSources,
} from './onboarding-realtor-shared';

interface Props {
  defaultName: string;
}

type Stage =
  | 'welcome' | 'name' | 'business' | 'where' | 'promise'
  | 'serve' | 'voice' | 'sources' | 'reveal';

const STAGE_ORDER: Stage[] = [
  'welcome', 'name', 'business', 'where', 'promise',
  'serve', 'voice', 'sources', 'reveal',
];

/** Stages that show progress dots (excludes the welcome cover + reveal payoff). */
const PROGRESS_STAGES: Stage[] = ['name', 'business', 'where', 'promise', 'serve', 'voice', 'sources'];

export function OnboardingRealtorV2({ defaultName }: Props) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>('welcome');

  // Identity + workspace.
  const [name, setName] = useState(defaultName || '');
  const [role, setRole] = useState<Role | null>(null);
  const [businessName, setBusinessName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [slugState, setSlugState] = useState<SlugState>({ kind: 'idle' });
  const [zipCode, setZipCode] = useState('');
  const [tenure, setTenure] = useState<Tenure | null>(null);

  // Profile.
  const [clientTypes, setClientTypes] = useState<string[]>([]);
  const [voiceGuidance, setVoiceGuidance] = useState('');
  const [tone, setTone] = useState<Tone | null>(null);
  const [leadSources, setLeadSources] = useState<string[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [workspaceCreated, setWorkspaceCreated] = useState(false);

  // Auto-derive slug from business name until the realtor edits it.
  useEffect(() => {
    if (slugTouched) return;
    setSlug(normalizeSlug(businessName));
  }, [businessName, slugTouched]);

  // Debounced slug availability check (same contract as V1).
  const checkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const checkSeq = useRef(0);
  useEffect(() => {
    if (checkTimer.current) clearTimeout(checkTimer.current);
    if (!slug) { setSlugState({ kind: 'idle' }); return; }
    if (!isValidSlug(slug)) {
      setSlugState({ kind: 'invalid', message: 'Use 3+ lowercase letters, numbers, or dashes.' });
      return;
    }
    setSlugState({ kind: 'checking' });
    const seq = ++checkSeq.current;
    checkTimer.current = setTimeout(async () => {
      try {
        const res = await fetch('/api/onboarding', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'check_slug', slug }),
        });
        if (seq !== checkSeq.current) return;
        if (!res.ok) { setSlugState({ kind: 'invalid', message: "Couldn't check that one. Try again." }); return; }
        const data = await res.json();
        if (data.reason === 'invalid') setSlugState({ kind: 'invalid', message: 'Use 3+ lowercase letters, numbers, or dashes.' });
        else if (data.available) setSlugState({ kind: 'available' });
        else setSlugState({ kind: 'taken' });
      } catch {
        if (seq !== checkSeq.current) return;
        setSlugState({ kind: 'invalid', message: 'I lost the connection. Try again.' });
      }
    }, 350);
    return () => { if (checkTimer.current) clearTimeout(checkTimer.current); };
  }, [slug]);

  const goTo = useCallback((s: Stage) => setStage(s), []);
  const goNext = useCallback(() => {
    const i = STAGE_ORDER.indexOf(stage);
    if (i < STAGE_ORDER.length - 1) setStage(STAGE_ORDER[i + 1]);
  }, [stage]);
  const goBack = useCallback(() => {
    const i = STAGE_ORDER.indexOf(stage);
    if (i > 0) setStage(STAGE_ORDER[i - 1]);
  }, [stage]);

  // ── Persistence ─────────────────────────────────────────────────────────────

  const saveProfilePartial = useCallback(async () => {
    if (!workspaceCreated) return;
    try {
      await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_realtor_profile',
          role: role ?? undefined,
          zipCode: zipCode || undefined,
          yearsExperience: tenure ? TENURE_TO_YEARS[tenure] : undefined,
          businessFocus: clientTypes,
          communicationTone: tone ?? undefined,
          quirksAndPreferences: voiceGuidance || undefined,
          leadSources,
        }),
      });
    } catch (err) {
      console.error('[onboarding-v2] partial save failed', err);
    }
  }, [workspaceCreated, role, zipCode, tenure, clientTypes, tone, voiceGuidance, leadSources]);

  // End of `where` → create the workspace, then advance to the promise.
  const handleCreateWorkspace = useCallback(async () => {
    if (!role || !tenure || !/^\d{5}$/.test(zipCode.trim()) || !businessName.trim() || slugState.kind !== 'available') return;
    setSubmitting(true);
    setError(null);
    try {
      const profileRes = await fetch('/api/onboarding', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save_profile', name: name.trim(), businessName: businessName.trim() }),
      });
      if (!profileRes.ok) throw new Error('profile');

      const spaceRes = await fetch('/api/onboarding', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_space',
          slug,
          businessName: businessName.trim(),
          intakePageTitle: 'Rental Application',
          intakePageIntro: 'Share a few details so I can review your rental fit faster.',
        }),
      });
      if (!spaceRes.ok) {
        if (spaceRes.status === 409) {
          setSlugState({ kind: 'taken' });
          setError('That URL was just taken — pick another.');
          setSubmitting(false);
          goTo('business');
          return;
        }
        throw new Error('space');
      }

      setWorkspaceCreated(true);
      await fetch('/api/onboarding', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save_realtor_profile', role, zipCode, yearsExperience: TENURE_TO_YEARS[tenure] }),
      });

      setSubmitting(false);
      goNext();
    } catch {
      setError("Couldn't save that — usually temporary.");
      setSubmitting(false);
    }
  }, [role, tenure, zipCode, businessName, slug, slugState, name, goNext, goTo]);

  // reveal "take me in" → complete + redirect (broker branch for owners).
  const handleFinish = useCallback(async () => {
    setSubmitting(true);
    setError(null);
    try {
      await saveProfilePartial();

      if (role === 'brokerage_owner') {
        const completeRes = await fetch('/api/onboarding', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'complete', accountType: 'both' }),
        });
        if (!completeRes.ok) throw new Error('complete');

        const brokerRes = await fetch('/api/broker/create', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: businessName.trim() }),
        });
        if (!brokerRes.ok) throw new Error('broker_create');
        const brokerData = (await brokerRes.json().catch(() => ({}))) as { brokerage?: { id?: string } };
        const newBrokerageId = brokerData.brokerage?.id;
        if (newBrokerageId) {
          await fetch('/api/spaces', {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ slug, brokerageId: newBrokerageId }),
          }).catch(() => undefined);
        }
        toast.success('Brokerage created. Chippi is ready.');
        router.push('/broker');
        return;
      }

      const completeRes = await fetch('/api/onboarding', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'complete', accountType: 'realtor' }),
      });
      if (!completeRes.ok) throw new Error('complete');

      toast.success("You're in. Chippi is ready.");
      router.push(`/s/${slug}/chippi`);
    } catch {
      setError("Couldn't finish setup — usually temporary.");
      setSubmitting(false);
    }
  }, [saveProfilePartial, slug, router, role, businessName]);

  // ── Shell wiring ──────────────────────────────────────────────────────────────

  const isBookend = stage === 'welcome' || stage === 'reveal';
  const progressIndex = PROGRESS_STAGES.indexOf(stage);
  // Back is offered on every middle stage except the first (name) and the
  // terminal reveal — going back from name would hit the welcome cover, and
  // going back from reveal after completion is meaningless.
  const canBack = !isBookend && stage !== 'name';

  return (
    <OnboardingShell
      stepIndex={progressIndex < 0 ? 0 : progressIndex}
      totalSteps={PROGRESS_STAGES.length}
      stepKey={stage}
      hideProgress={isBookend}
      onBack={canBack ? goBack : undefined}
    >
      {stage === 'welcome' && <StageWelcome onContinue={goNext} />}

      {stage === 'name' && (
        <StageName
          name={name}
          role={role}
          onChangeName={setName}
          onPickRole={setRole}
          onContinue={goNext}
        />
      )}

      {stage === 'business' && (
        <StageBusiness
          businessName={businessName}
          slug={slug}
          slugState={slugState}
          submitting={submitting}
          error={error}
          onChangeBusinessName={setBusinessName}
          onTouchSlug={(s) => { setSlugTouched(true); setSlug(normalizeSlug(s)); }}
          onContinue={goNext}
        />
      )}

      {stage === 'where' && (
        <StageWhere
          zipCode={zipCode}
          tenure={tenure}
          submitting={submitting}
          error={error}
          onChangeZip={setZipCode}
          onChangeTenure={setTenure}
          onContinue={handleCreateWorkspace}
        />
      )}

      {stage === 'promise' && <StagePromise onContinue={goNext} />}

      {stage === 'serve' && (
        <StageWhoYouServe
          clientTypes={clientTypes}
          voiceGuidance={voiceGuidance}
          onToggleClientType={(v) => setClientTypes((prev) => toggleCapped(prev, v, 3))}
          onChangeVoiceGuidance={setVoiceGuidance}
          onContinue={() => { void saveProfilePartial(); goNext(); }}
        />
      )}

      {stage === 'voice' && (
        <StageVoice
          name={name}
          businessName={businessName}
          tone={tone}
          onPick={(t) => { setTone(t); void saveProfilePartial(); goNext(); }}
        />
      )}

      {stage === 'sources' && (
        <StageSources
          leadSources={leadSources}
          onToggle={(v) => setLeadSources((prev) => toggle(prev, v))}
          onContinue={() => { void saveProfilePartial(); goNext(); }}
        />
      )}

      {stage === 'reveal' && (
        <StageReveal
          name={name}
          businessName={businessName}
          tone={tone ?? 'warm'}
          clientTypes={clientTypes}
          leadSources={leadSources}
          submitting={submitting}
          error={error}
          onFinish={handleFinish}
        />
      )}
    </OnboardingShell>
  );
}

// ── Stage: welcome ─────────────────────────────────────────────────────────────

function StageWelcome({ onContinue }: { onContinue: () => void }) {
  return (
    <div className="space-y-10 text-center">
      <div className="space-y-3">
        <h1 className="text-4xl sm:text-5xl tracking-tight text-foreground" style={{ fontFamily: 'var(--font-title)' }}>
          Hi. I&apos;m Chippi.
        </h1>
        <p className="text-2xl sm:text-3xl tracking-tight text-muted-foreground" style={{ fontFamily: 'var(--font-title)' }}>
          Let&apos;s set up your business in about five minutes —
          <br className="hidden sm:block" />
          and by the end, I&apos;ll already be working on it.
        </p>
      </div>
      <button
        type="button"
        onClick={onContinue}
        className={CHIPPI_PILL}
      >
        Let&apos;s go
        <ArrowRight size={14} />
      </button>
    </div>
  );
}

// ── Stage: name + role ─────────────────────────────────────────────────────────

function StageName({
  name, role, onChangeName, onPickRole, onContinue,
}: {
  name: string;
  role: Role | null;
  onChangeName: (v: string) => void;
  onPickRole: (r: Role) => void;
  onContinue: () => void;
}) {
  // Role pick auto-advances when the name is already filled (the common
  // case — Clerk pre-fills it). A 380ms beat lets the selection register
  // before the screen glides forward. If name is empty, the realtor
  // types it and uses the Continue button instead — no jarring jump.
  const nameReady = name.trim().length > 0;
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (advanceTimer.current) clearTimeout(advanceTimer.current); }, []);

  const pick = (r: Role) => {
    onPickRole(r);
    if (nameReady) {
      if (advanceTimer.current) clearTimeout(advanceTimer.current);
      advanceTimer.current = setTimeout(onContinue, 380);
    }
  };

  return (
    <div className="space-y-8">
      <div className="text-center space-y-2">
        <h2 className="text-2xl tracking-tight text-foreground" style={{ fontFamily: 'var(--font-title)' }}>
          First — who are you?
        </h2>
        <p className="text-sm text-muted-foreground">Just your name and what you run. One tap each.</p>
      </div>

      <Section label="Your name">
        <input
          type="text"
          autoComplete="name"
          value={name}
          onChange={(e) => onChangeName(e.target.value)}
          placeholder="Sarah Chen"
          className="w-full rounded-lg border border-border bg-background px-3.5 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </Section>

      <Section label="What are you running?">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <PickerButton selected={role === 'solo'} onClick={() => pick('solo')}>
            <span className="font-medium">I&apos;m a solo agent</span>
          </PickerButton>
          <PickerButton selected={role === 'team_lead'} onClick={() => pick('team_lead')}>
            <span className="font-medium">I lead a team</span>
          </PickerButton>
          <PickerButton selected={role === 'brokerage_owner'} onClick={() => pick('brokerage_owner')}>
            <span className="font-medium">I own the brokerage</span>
          </PickerButton>
        </div>
      </Section>

      <StageContinue onClick={onContinue} disabled={!nameReady || role === null} />
    </div>
  );
}

// ── Stage: business name + slug ────────────────────────────────────────────────

function StageBusiness({
  businessName, slug, slugState, submitting, error,
  onChangeBusinessName, onTouchSlug, onContinue,
}: {
  businessName: string;
  slug: string;
  slugState: SlugState;
  submitting: boolean;
  error: string | null;
  onChangeBusinessName: (v: string) => void;
  onTouchSlug: (v: string) => void;
  onContinue: () => void;
}) {
  const linkPreview = slug ? `${rootDomain}/apply/${slug}` : `${rootDomain}/apply/your-business`;
  const canContinue = !submitting && businessName.trim().length > 0 && slugState.kind === 'available';

  return (
    <div className="space-y-8">
      <div className="text-center space-y-2">
        <h2 className="text-2xl tracking-tight text-foreground" style={{ fontFamily: 'var(--font-title)' }}>
          What should leads call your business?
        </h2>
        <p className="text-sm text-muted-foreground">This names your intake link — where leads reach you.</p>
      </div>

      <Section label="Business name">
        <input
          type="text"
          value={businessName}
          onChange={(e) => onChangeBusinessName(e.target.value)}
          placeholder="Coastal Realty"
          autoFocus
          className="w-full rounded-lg border border-border bg-background px-3.5 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </Section>

      <Section label="Your intake link">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={slug}
            onChange={(e) => onTouchSlug(e.target.value)}
            placeholder="your-business"
            className="w-full rounded-lg border border-border bg-background px-3.5 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <p className="text-xs text-muted-foreground mt-1.5 break-all">{linkPreview}</p>
        <SlugHint state={slugState} />
      </Section>

      {error && <ErrorLine message={error} />}

      <StageContinue onClick={onContinue} disabled={!canContinue} />
    </div>
  );
}

function SlugHint({ state }: { state: SlugState }) {
  if (state.kind === 'idle') return null;
  if (state.kind === 'checking') return <p className="text-xs text-muted-foreground mt-1">Checking…</p>;
  if (state.kind === 'available') return <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1 inline-flex items-center gap-1"><Check size={12} /> Available</p>;
  if (state.kind === 'taken') return <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">Taken — try another.</p>;
  return <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">{state.message}</p>;
}

// ── Stage: ZIP + tenure ────────────────────────────────────────────────────────

const TENURE_OPTIONS: { value: Tenure; label: string }[] = [
  { value: 'lt1', label: 'Under a year' },
  { value: '1-3', label: '1–3 years' },
  { value: '4-10', label: '4–10 years' },
  { value: '10plus', label: '10+ years' },
];

function StageWhere({
  zipCode, tenure, submitting, error, onChangeZip, onChangeTenure, onContinue,
}: {
  zipCode: string;
  tenure: Tenure | null;
  submitting: boolean;
  error: string | null;
  onChangeZip: (v: string) => void;
  onChangeTenure: (t: Tenure) => void;
  onContinue: () => void;
}) {
  const canContinue = !submitting && /^\d{5}$/.test(zipCode.trim()) && tenure !== null;
  return (
    <div className="space-y-8">
      <div className="text-center space-y-2">
        <h2 className="text-2xl tracking-tight text-foreground" style={{ fontFamily: 'var(--font-title)' }}>
          Where do you work, and for how long?
        </h2>
        <p className="text-sm text-muted-foreground">So I speak to your market like a local, not a tourist.</p>
      </div>

      <Section label="Primary ZIP code">
        <input
          type="text"
          inputMode="numeric"
          value={zipCode}
          onChange={(e) => onChangeZip(e.target.value.replace(/\D/g, '').slice(0, 5))}
          placeholder="33139"
          autoFocus
          className="w-full rounded-lg border border-border bg-background px-3.5 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </Section>

      <Section label="How long have you been in real estate?">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {TENURE_OPTIONS.map((opt) => (
            <PickerButton key={opt.value} selected={tenure === opt.value} onClick={() => onChangeTenure(opt.value)}>
              <span className="font-medium">{opt.label}</span>
            </PickerButton>
          ))}
        </div>
      </Section>

      {error && <ErrorLine message={error} />}

      <StageContinue onClick={onContinue} disabled={!canContinue}>
        {submitting ? <Loader2 size={14} className="animate-spin" /> : 'Continue'}
      </StageContinue>
    </div>
  );
}

// ── Stage: the trust promise ───────────────────────────────────────────────────

function StagePromise({ onContinue }: { onContinue: () => void }) {
  // A breath between setup and the deeper profile questions. Names the
  // single most common new-user fear ("will it send things without
  // me?") once, plainly — then never mentions it again. A 1.4s minimum
  // gate keeps the realtor from tapping past it before reading.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setReady(true), 1400);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="space-y-10 text-center">
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">One promise.</p>
        <h2
          className="text-3xl sm:text-4xl tracking-tight text-foreground leading-snug"
          style={{ fontFamily: 'var(--font-title)' }}
        >
          I draft. You approve.
          <br />
          Nothing leaves without your name on it.
        </h2>
      </div>
      <button
        type="button"
        onClick={onContinue}
        disabled={!ready}
        className="inline-flex items-center justify-center gap-2 rounded-full bg-foreground text-background px-6 py-3 text-sm font-semibold transition-all duration-300 hover:opacity-90 disabled:opacity-0"
      >
        Got it
        <ArrowRight size={14} />
      </button>
    </div>
  );
}

// ── Stage: the reveal (typing draft) ───────────────────────────────────────────

function StageReveal({
  name, businessName, tone, clientTypes, leadSources, submitting, error, onFinish,
}: {
  name: string;
  businessName: string;
  tone: Tone;
  clientTypes: string[];
  leadSources: string[];
  submitting: boolean;
  error: string | null;
  onFinish: () => void;
}) {
  const firstName = (name.trim().split(/\s+/)[0]) || 'there';
  const draft = composeOnboardingDraft({ name, businessName, tone, clientTypes, leadSources });
  const [typed, setTyped] = useState(false);

  return (
    <div className="space-y-8">
      <div className="text-center space-y-2">
        <h2 className="text-2xl tracking-tight text-foreground" style={{ fontFamily: 'var(--font-title)' }}>
          That&apos;s everything I need, {firstName}.
        </h2>
        <p className="text-sm text-muted-foreground">{draft.frame}</p>
      </div>

      {/* The draft card — Chippi types it out, live. The whole arc points
          here: the welcome promised "by the end I'll already be working
          on it," and this is the moment that lands. */}
      <div className="rounded-xl border border-border/70 bg-card p-5">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Draft · {tone === 'warm' ? 'Warm' : 'Direct'}
        </p>
        <p className="text-sm text-foreground leading-relaxed min-h-[7.5rem]">
          <TypingText text={draft.body} onDone={() => setTyped(true)} />
        </p>
      </div>

      {error && <ErrorLine message={error} />}

      {/* The finish button fades in only once the draft finishes typing —
          the realtor watches Chippi work, THEN walks in. */}
      <div className={`flex justify-end transition-opacity duration-500 ${typed ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <button
          type="button"
          onClick={onFinish}
          disabled={submitting}
          className={CHIPPI_PILL}
        >
          {submitting ? <Loader2 size={14} className="animate-spin" /> : <>Looks good — take me in <ArrowRight size={14} /></>}
        </button>
      </div>
    </div>
  );
}
