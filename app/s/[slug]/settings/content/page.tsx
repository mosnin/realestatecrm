'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

export default function ContentSettingsPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? '';

  const [intakePageTitle, setIntakePageTitle] = useState('Rental Application');
  const [intakePageIntro, setIntakePageIntro] = useState('');
  const [intakeVideoUrl, setIntakeVideoUrl] = useState('');
  const [intakeThankYouTitle, setIntakeThankYouTitle] = useState('');
  const [intakeThankYouMessage, setIntakeThankYouMessage] = useState('');
  const [intakeConfirmationEmail, setIntakeConfirmationEmail] = useState('');
  const [intakeDisclaimerText, setIntakeDisclaimerText] = useState('');
  const [intakeFooterLinks, setIntakeFooterLinks] = useState<{ label: string; url: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) return;
    fetch(`/api/spaces?slug=${encodeURIComponent(slug)}`)
      .then((r) => r.json())
      .then((data) => {
        const s = data.settings ?? data;
        setIntakePageTitle(s.intakePageTitle ?? 'Rental Application');
        setIntakePageIntro(s.intakePageIntro ?? '');
        setIntakeVideoUrl(s.intakeVideoUrl ?? '');
        setIntakeThankYouTitle(s.intakeThankYouTitle ?? '');
        setIntakeThankYouMessage(s.intakeThankYouMessage ?? '');
        setIntakeConfirmationEmail(s.intakeConfirmationEmail ?? '');
        setIntakeDisclaimerText(s.intakeDisclaimerText ?? '');
        setIntakeFooterLinks(s.intakeFooterLinks ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [slug]);

  function getVideoEmbedUrl(url: string): string | null {
    if (!url) return null;
    const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/);
    if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}`;
    const loomMatch = url.match(/loom\.com\/share\/([\w-]+)/);
    if (loomMatch) return `https://www.loom.com/embed/${loomMatch[1]}`;
    return null;
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/spaces', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          intakePageTitle,
          intakePageIntro,
          intakeVideoUrl: intakeVideoUrl.trim() || null,
          intakeThankYouTitle: intakeThankYouTitle.trim() || null,
          intakeThankYouMessage: intakeThankYouMessage.trim() || null,
          intakeConfirmationEmail: intakeConfirmationEmail.trim() || null,
          intakeDisclaimerText: intakeDisclaimerText.trim() || null,
          intakeFooterLinks,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Failed to save content settings.');
      }
      setSaved(true);
      toast.success('Content settings saved.');
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4 max-w-3xl animate-pulse">
        <div className="h-8 bg-muted rounded-lg w-40" />
        <div className="h-64 bg-muted rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="space-y-1">
        <h2 className="text-base font-medium text-foreground">Content</h2>
        <p className="text-[13px] text-muted-foreground">Intake page title, intro, video, thank you message, disclaimer, and footer links</p>
      </div>

      <form onSubmit={handleSave} className="space-y-5">
        {/* Intake link content */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-6 py-4 border-b border-border bg-muted/20">
            <p className="font-semibold text-sm">Intake page</p>
          </div>
          <div className="px-6 py-5 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="intakePageTitle">Page title</Label>
              <Input id="intakePageTitle" value={intakePageTitle} onChange={(e) => setIntakePageTitle(e.target.value)} placeholder="Rental Application" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="intakePageIntro">Intro line</Label>
              <Input id="intakePageIntro" value={intakePageIntro} onChange={(e) => setIntakePageIntro(e.target.value)} placeholder="Share a few details so I can review your rental fit faster." />
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Preview</p>
              <p className="font-semibold text-sm">{intakePageTitle || 'Rental Application'}</p>
              <p className="text-xs text-muted-foreground">{intakePageIntro || 'Your intro line here.'}</p>
            </div>
          </div>
        </div>

        {/* Video */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-6 py-4 border-b border-border bg-muted/20">
            <p className="font-semibold text-sm">Welcome video</p>
          </div>
          <div className="px-6 py-5 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="intakeVideoUrl">Video URL</Label>
              <Input id="intakeVideoUrl" value={intakeVideoUrl} onChange={(e) => setIntakeVideoUrl(e.target.value)} placeholder="Paste YouTube or Loom URL" />
              <p className="text-xs text-muted-foreground">Embed a welcome video at the top of your intake page.</p>
            </div>
            {getVideoEmbedUrl(intakeVideoUrl) && (
              <div className="rounded-lg overflow-hidden border border-border aspect-video">
                <iframe src={getVideoEmbedUrl(intakeVideoUrl)!} className="w-full h-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
              </div>
            )}
          </div>
        </div>

        {/* Thank you & Disclaimer */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-6 py-4 border-b border-border bg-muted/20">
            <p className="font-semibold text-sm">Messages</p>
          </div>
          <div className="px-6 py-5 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="intakeThankYouTitle">Thank you title</Label>
              <Input id="intakeThankYouTitle" value={intakeThankYouTitle} onChange={(e) => setIntakeThankYouTitle(e.target.value)} placeholder="Application received" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="intakeThankYouMessage">Thank you message</Label>
              <Textarea id="intakeThankYouMessage" value={intakeThankYouMessage} onChange={(e) => setIntakeThankYouMessage(e.target.value)} placeholder="Thank you for submitting your application..." rows={3} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="intakeConfirmationEmail">Confirmation email</Label>
              <Textarea id="intakeConfirmationEmail" value={intakeConfirmationEmail} onChange={(e) => setIntakeConfirmationEmail(e.target.value)} placeholder="Hi! Thanks for applying..." rows={4} />
              <p className="text-xs text-muted-foreground">Custom email body sent to the applicant after submission.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="intakeDisclaimerText">Terms / Disclaimer</Label>
              <Textarea id="intakeDisclaimerText" value={intakeDisclaimerText} onChange={(e) => setIntakeDisclaimerText(e.target.value)} placeholder="By submitting this form, you agree to..." rows={3} />
              <p className="text-xs text-muted-foreground">Legal text displayed at the bottom of the intake form.</p>
            </div>
          </div>
        </div>

        {/* Footer Links */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-6 py-4 border-b border-border bg-muted/20">
            <p className="font-semibold text-sm">Footer links</p>
          </div>
          <div className="px-6 py-5 space-y-3">
            {intakeFooterLinks.map((link, index) => (
              <div key={index} className="flex items-center gap-2">
                <Input value={link.label} onChange={(e) => { const updated = [...intakeFooterLinks]; updated[index] = { ...updated[index], label: e.target.value }; setIntakeFooterLinks(updated); }} placeholder="Label" className="flex-1" />
                <Input value={link.url} onChange={(e) => { const updated = [...intakeFooterLinks]; updated[index] = { ...updated[index], url: e.target.value }; setIntakeFooterLinks(updated); }} placeholder="https://..." className="flex-1" />
                <button type="button" onClick={() => setIntakeFooterLinks(intakeFooterLinks.filter((_, i) => i !== index))} className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-md border border-border text-muted-foreground hover:text-destructive hover:border-destructive/40 transition-colors">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            <button type="button" onClick={() => setIntakeFooterLinks([...intakeFooterLinks, { label: '', url: '' }])} className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors">
              <Plus size={14} /> Add link
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={saving}>
            {saving ? (
              <><Loader2 size={14} className="mr-2 animate-spin" /> Saving...</>
            ) : saved ? 'Saved!' : 'Save content'}
          </Button>
          {saved && <p className="text-sm text-primary">Changes saved.</p>}
        </div>
      </form>
    </div>
  );
}
