'use client';

/**
 * AutomationsIntro — first-visit tour of the Automations feature.
 *
 * IntroDisclosure (cult-ui) wired to the workflows surface: opens once per
 * browser (persisted under feature key `automations-workflows` in
 * localStorage by the primitive itself), walks through the four ideas a
 * realtor needs to trust the feature — trigger, steps, autonomy, test runs —
 * and gets out of the way. Steps are text-only on purpose: real product
 * screenshots can slot into `media` later; nothing here is placeholder
 * content, it describes the shipping feature.
 */

import { useEffect, useState } from 'react';
import { IntroDisclosure } from '@/components/ui/intro-disclosure';

/**
 * Single dismissal key owned by this wrapper. The primitive's own
 * useFeatureVisibility starts `null` → coerced false → an internal effect
 * force-closes the dialog on mount and never reopens it, so `useState(true)`
 * silently never shows. We gate opening ourselves (after mount, child effects
 * have settled) and record dismissal on complete/skip/close.
 */
const SEEN_KEY = 'chippi_automations_intro_seen';

export const AUTOMATIONS_INTRO_STEPS = [
  {
    title: 'Automations, on your terms',
    short_description: 'Workflows that work your book',
    full_description:
      'A workflow is a recipe: when something happens, Chippi runs the steps you laid out — tag a contact, draft a follow-up, book the tour, move the deal. You design it once; it works every lead after that.',
  },
  {
    title: 'Start from a trigger',
    short_description: 'New lead, schedule, or webhook',
    full_description:
      'Every workflow starts with a trigger — a new lead arriving, a timer you set, or a webhook from another tool. Pick the moment; the workflow takes it from there.',
  },
  {
    title: 'You choose the autonomy',
    short_description: 'Choose draft or automatic',
    full_description:
      'Automatic mode completes sends and connected-app actions when the trigger fires. Draft and Draft + notify still wait for your tap. You can change the setting per workflow, any time.',
  },
  {
    title: 'Test before it goes live',
    short_description: 'Dry-run with sample data',
    full_description:
      'Run any workflow against sample data to watch each step fire before a real lead ever touches it. When the run log reads the way you want, flip it on.',
  },
];

export function AutomationsIntro() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(SEEN_KEY)) setOpen(true);
    } catch {
      // Storage unavailable (private mode) — skip the tour rather than nag.
    }
  }, []);

  const markSeen = () => {
    try {
      localStorage.setItem(SEEN_KEY, '1');
    } catch {}
  };

  return (
    <IntroDisclosure
      open={open}
      setOpen={(v) => {
        if (!v) markSeen();
        setOpen(v);
      }}
      onComplete={markSeen}
      onSkip={markSeen}
      steps={AUTOMATIONS_INTRO_STEPS}
      featureId="automations-workflows"
      showProgressBar
    />
  );
}

export default AutomationsIntro;
