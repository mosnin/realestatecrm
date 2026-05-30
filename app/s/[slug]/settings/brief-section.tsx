'use client';

/**
 * Brief settings — four switches the realtor cares about, no more.
 *
 *   On / Off  — opt out of the daily brief entirely.
 *   Time      — hour of day in the realtor's timezone (default 7 AM).
 *   Email     — opt-in side channel.
 *   SMS       — opt-in side channel; requires phone + SMS notifications.
 *
 * Configuration is failure to decide. The 7 AM default is picked for
 * everyone; the time picker exists for the few who want to shift it.
 * Per the rubric: changes save on toggle. A 'Save' button is the
 * realtor managing state the system should manage. Debounced 400ms so
 * a rapid two-flip doesn't fire two PATCHes.
 */

import { useEffect, useRef, useState } from 'react';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { BODY, BODY_MUTED, CAPTION } from '@/lib/typography';

interface BriefSectionProps {
  slug: string;
}

const HOUR_OPTIONS: { value: number; label: string }[] = [
  { value: 6, label: '6:00 AM' },
  { value: 7, label: '7:00 AM' },
  { value: 8, label: '8:00 AM' },
  { value: 9, label: '9:00 AM' },
];

export function BriefSection({ slug }: BriefSectionProps) {
  const [enabled, setEnabled] = useState(true);
  const [hour, setHour] = useState<number>(7);
  const [timezone, setTimezone] = useState<string>('America/New_York');
  const [emailDelivery, setEmailDelivery] = useState(false);
  const [smsDelivery, setSmsDelivery] = useState(false);
  const [masterEmail, setMasterEmail] = useState(true);
  const [masterSms, setMasterSms] = useState(false);
  const [phoneOnFile, setPhoneOnFile] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sendingTest, setSendingTest] = useState(false);

  // True after the initial GET completes — auto-save only fires after the
  // first hydration so the load itself doesn't trigger a PATCH back.
  const hydrated = useRef(false);
  // Debounce token — cleared on each setting change so a rapid two-flip
  // fires one PATCH, not two.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!slug) return;
    fetch(`/api/spaces?slug=${encodeURIComponent(slug)}`)
      .then((r) => r.json())
      .then((data) => {
        const s = data.settings ?? data;
        if (typeof s.briefEnabled === 'boolean') setEnabled(s.briefEnabled);
        if (typeof s.briefHour === 'number') setHour(s.briefHour);
        if (typeof s.timezone === 'string') setTimezone(s.timezone);
        if (typeof s.briefEmail === 'boolean') setEmailDelivery(s.briefEmail);
        if (typeof s.briefSms === 'boolean') setSmsDelivery(s.briefSms);
        if (typeof s.notifications === 'boolean') setMasterEmail(s.notifications);
        if (typeof s.smsNotifications === 'boolean') setMasterSms(s.smsNotifications);
        if (typeof s.phoneNumber === 'string' && s.phoneNumber.trim().length > 0) {
          setPhoneOnFile(true);
        }
      })
      .catch(() => {})
      .finally(() => {
        setLoading(false);
        // One tick after hydration so the auto-save effect doesn't fire
        // on the same render as the state landing.
        setTimeout(() => {
          hydrated.current = true;
        }, 0);
      });
  }, [slug]);

  // Auto-save on each change — kills the Save button per Q10
  // Knowledge balance: the realtor shouldn't manage state the system
  // can manage. Debounced 400ms so a two-flip fires one PATCH.
  useEffect(() => {
    if (!hydrated.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        const res = await fetch('/api/spaces', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            slug,
            briefEnabled: enabled,
            briefHour: hour,
            briefEmail: emailDelivery,
            briefSms: smsDelivery,
          }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.error || 'Could not save.');
        }
        toast.success('Brief settings saved.');
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'That tripped me up. Try again.');
      }
    }, 400);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [slug, enabled, hour, emailDelivery, smsDelivery]);

  async function handleSendTest() {
    setSendingTest(true);
    try {
      const res = await fetch('/api/agent/briefing/test', { method: 'POST' });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Test send failed.');
      }
      toast.success('Test sent.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Test send failed.');
    } finally {
      setSendingTest(false);
    }
  }

  if (loading) {
    return <div className="h-32 bg-foreground/[0.04] rounded-md animate-pulse" />;
  }

  return (
    <div className="space-y-6">
      <p className={BODY_MUTED}>
        One focal sentence and three to five cards, delivered to the workspace
        each morning. Quiet days say so. Changes save automatically.
      </p>

      <div className="flex items-center justify-between gap-4 py-3 border-t border-border/60">
        <div className="min-w-0">
          <p className={`${BODY} font-medium`}>Daily brief</p>
          <p className={`${CAPTION} mt-0.5`}>
            On by default. Turn off to stop generating.
          </p>
        </div>
        <Switch checked={enabled} onCheckedChange={setEnabled} />
      </div>

      <div
        className={cn(
          'flex items-center justify-between gap-4 py-3 border-t border-border/60 transition-opacity',
          !enabled && 'opacity-50',
        )}
      >
        <div className="min-w-0">
          <p className={`${BODY} font-medium`}>Time</p>
          <p className={`${CAPTION} mt-0.5`}>
            Delivered in <span className="text-foreground">{timezone}</span>.
          </p>
        </div>
        <select
          value={hour}
          onChange={(e) => setHour(parseInt(e.target.value, 10))}
          disabled={!enabled}
          className={cn(
            'h-9 px-3 rounded-md border border-border/70 bg-background text-sm',
            'focus:outline-none focus:ring-2 focus:ring-foreground/30',
            'disabled:cursor-not-allowed',
          )}
        >
          {HOUR_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div
        className={cn(
          'flex items-center justify-between gap-4 py-3 border-t border-border/60 transition-opacity',
          (!enabled || !masterEmail) && 'opacity-50',
        )}
      >
        <div className="min-w-0">
          <p className={`${BODY} font-medium`}>Also send by email</p>
          <p className={`${CAPTION} mt-0.5`}>
            {masterEmail ? 'Headline + a tap to open. Off by default.' : 'Turn on email notifications first.'}
          </p>
        </div>
        <Switch
          checked={emailDelivery && masterEmail}
          onCheckedChange={setEmailDelivery}
          disabled={!enabled || !masterEmail}
        />
      </div>

      <div
        className={cn(
          'flex items-center justify-between gap-4 py-3 border-t border-border/60 transition-opacity',
          (!enabled || !masterSms || !phoneOnFile) && 'opacity-50',
        )}
      >
        <div className="min-w-0">
          <p className={`${BODY} font-medium`}>Also send by text</p>
          <p className={`${CAPTION} mt-0.5`}>
            {!masterSms
              ? 'Turn on text notifications first.'
              : !phoneOnFile
                ? 'Add a phone number in Workspace settings first.'
                : 'One line + the link. Off by default.'}
          </p>
        </div>
        <Switch
          checked={smsDelivery && masterSms && phoneOnFile}
          onCheckedChange={setSmsDelivery}
          disabled={!enabled || !masterSms || !phoneOnFile}
        />
      </div>

      {/* Only the test send remains — no Save button. The auto-save
          effect commits each change. */}
      {(emailDelivery || smsDelivery) && enabled && (
        <div className="pt-1">
          <button
            type="button"
            onClick={handleSendTest}
            disabled={sendingTest}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2 disabled:opacity-60"
          >
            {sendingTest ? 'Sending…' : 'Send me a test'}
          </button>
        </div>
      )}
    </div>
  );
}
