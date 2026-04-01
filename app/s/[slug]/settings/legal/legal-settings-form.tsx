'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CheckCircle2, Loader2 } from 'lucide-react';

interface LegalSettingsFormProps {
  slug: string;
  privacyPolicyUrl: string;
  consentCheckboxLabel: string;
}

function isValidHttpsUrl(value: string): boolean {
  if (!value.startsWith('https://')) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname.length > 0;
  } catch {
    return false;
  }
}

export function LegalSettingsForm({ slug, privacyPolicyUrl: initialUrl, consentCheckboxLabel: initialLabel }: LegalSettingsFormProps) {
  const [privacyPolicyUrl, setPrivacyPolicyUrl] = useState(initialUrl);
  const [consentCheckboxLabel, setConsentCheckboxLabel] = useState(initialLabel);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [urlError, setUrlError] = useState('');

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setUrlError('');
    setSaveError('');

    // Validate URL if provided
    const trimmedUrl = privacyPolicyUrl.trim();
    if (trimmedUrl && !isValidHttpsUrl(trimmedUrl)) {
      setUrlError('URL must start with https:// and be a valid URL');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/spaces', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          name: undefined,
          privacyPolicyUrl: trimmedUrl || null,
          consentCheckboxLabel: consentCheckboxLabel.trim() || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setSaveError(data.error || 'Failed to save settings. Please try again.');
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      setSaveError('Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <div className="rounded-lg border border-border bg-card p-6 space-y-5">
        <div className="space-y-1.5">
          <Label htmlFor="privacyPolicyUrl">Privacy Policy URL</Label>
          <Input
            id="privacyPolicyUrl"
            type="url"
            placeholder="https://yourdomain.com/privacy"
            value={privacyPolicyUrl}
            onChange={(e) => {
              setPrivacyPolicyUrl(e.target.value);
              setUrlError('');
            }}
            className={urlError ? 'border-destructive' : ''}
          />
          {urlError && <p className="text-xs text-destructive">{urlError}</p>}
          <p className="text-xs text-muted-foreground">
            Required before your intake form can collect submissions. Link to your privacy policy.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="consentCheckboxLabel">Custom Consent Checkbox Label</Label>
          <Input
            id="consentCheckboxLabel"
            type="text"
            placeholder="I agree to the Privacy Policy"
            value={consentCheckboxLabel}
            onChange={(e) => setConsentCheckboxLabel(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            If blank, defaults to: I agree to [Business Name]&apos;s Privacy Policy
          </p>
        </div>
      </div>

      {saveError && (
        <p className="text-sm text-destructive">{saveError}</p>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={saving}>
          {saving ? (
            <>
              <Loader2 size={15} className="mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            'Save'
          )}
        </Button>
        {saved && (
          <span className="flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 size={15} />
            Saved
          </span>
        )}
      </div>
    </form>
  );
}
