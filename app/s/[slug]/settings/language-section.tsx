'use client';

/**
 * Language preference — lets a user switch their account language (e.g. a US
 * English account to Spanish). Saves to the User row via
 * /api/settings/language, which also pins the `chippi_lang` cookie so the
 * public site follows the choice immediately on this browser.
 *
 * Honest-UI note: today the language applies to Chippi's public website
 * pages; the in-app dashboard is not yet translated, and the copy below says
 * exactly that rather than implying a full-app switch.
 */

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { BODY_MUTED, PRIMARY_PILL } from '@/lib/typography';
import { LANGS, LANG_LABELS, isLang, type Lang } from '@/lib/i18n/markets';

export function LanguageSection() {
  const [language, setLanguage] = useState<Lang>('en');
  const [initial, setInitial] = useState<Lang>('en');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/settings/language')
      .then((r) => r.json())
      .then((d) => {
        if (isLang(d?.language)) {
          setLanguage(d.language);
          setInitial(d.language);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch('/api/settings/language', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Could not save.');
      }
      setInitial(language);
      toast.success('Language saved.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'That tripped me up. Try again.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="h-16 bg-foreground/[0.04] rounded-md animate-pulse" />;
  }

  return (
    <div className="space-y-4">
      <div role="radiogroup" aria-label="Language" className="flex flex-wrap gap-2">
        {LANGS.map((l) => (
          <button
            key={l}
            type="button"
            role="radio"
            aria-checked={language === l}
            onClick={() => setLanguage(l)}
            className={cn(
              'rounded-full border px-4 py-1.5 text-[13px] transition-colors',
              language === l
                ? 'border-foreground bg-foreground text-background font-medium'
                : 'border-border text-muted-foreground hover:text-foreground',
            )}
          >
            {LANG_LABELS[l]}
          </button>
        ))}
      </div>
      <p className={BODY_MUTED}>
        Applies to Chippi&apos;s public pages on this account. The in-app dashboard stays in
        English for now.
      </p>
      {language !== initial && (
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className={cn(PRIMARY_PILL, 'disabled:opacity-60 disabled:cursor-not-allowed')}
        >
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {saving ? 'Saving' : 'Save language'}
        </button>
      )}
    </div>
  );
}
