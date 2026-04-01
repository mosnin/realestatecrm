'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Loader2, Upload } from 'lucide-react';
import { toast } from 'sonner';

export default function AppearanceSettingsPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? '';

  const [intakeAccentColor, setIntakeAccentColor] = useState('#ff964f');
  const [intakeBorderRadius, setIntakeBorderRadius] = useState<'rounded' | 'sharp'>('rounded');
  const [intakeFont, setIntakeFont] = useState<'system' | 'serif' | 'mono'>('system');
  const [intakeDarkMode, setIntakeDarkMode] = useState(false);
  const [intakeHeaderBgColor, setIntakeHeaderBgColor] = useState('');
  const [intakeHeaderGradient, setIntakeHeaderGradient] = useState('');
  const [intakeFaviconUrl, setIntakeFaviconUrl] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [logoPreview, setLogoPreview] = useState('');
  const [faviconPreview, setFaviconPreview] = useState('');
  const logoInputRef = useRef<HTMLInputElement>(null);
  const faviconInputRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) return;
    fetch(`/api/spaces?slug=${encodeURIComponent(slug)}`)
      .then((r) => r.json())
      .then((data) => {
        const s = data.settings ?? data;
        setIntakeAccentColor(s.intakeAccentColor ?? '#ff964f');
        setIntakeBorderRadius(s.intakeBorderRadius ?? 'rounded');
        setIntakeFont(s.intakeFont ?? 'system');
        setIntakeDarkMode(s.intakeDarkMode ?? false);
        setIntakeHeaderBgColor(s.intakeHeaderBgColor ?? '');
        setIntakeHeaderGradient(s.intakeHeaderGradient ?? '');
        setIntakeFaviconUrl(s.intakeFaviconUrl ?? '');
        setFaviconPreview(s.intakeFaviconUrl ?? '');
        setLogoUrl(s.logoUrl ?? '');
        setLogoPreview(s.logoUrl ?? '');
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [slug]);

  async function handleUpload(file: File, type: 'logo' | 'favicon') {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', type);
    const res = await fetch('/api/upload', { method: 'POST', body: formData });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error || 'Upload failed');
      return null;
    }
    const { url } = await res.json();
    return url;
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast.error('File must be under 2MB'); return; }
    setLogoPreview(URL.createObjectURL(file));
    const url = await handleUpload(file, 'logo');
    if (url) { setLogoUrl(url); setLogoPreview(url); }
    else { setLogoPreview(''); }
  }

  async function handleFaviconUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast.error('File must be under 2MB'); return; }
    setFaviconPreview(URL.createObjectURL(file));
    const url = await handleUpload(file, 'favicon');
    if (url) { setIntakeFaviconUrl(url); setFaviconPreview(url); }
    else { setFaviconPreview(''); }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_space',
          slug,
          intakeAccentColor,
          intakeBorderRadius,
          intakeFont,
          intakeDarkMode,
          intakeHeaderBgColor: intakeHeaderBgColor || null,
          intakeHeaderGradient: intakeHeaderGradient || null,
          intakeFaviconUrl: intakeFaviconUrl.trim() || null,
          logoUrl: logoUrl.trim() || null,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Failed to save appearance settings.');
      }
      setSaved(true);
      toast.success('Appearance settings saved.');
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
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Appearance</h1>
        <p className="text-muted-foreground text-sm">Branding, colors, fonts, and visual settings for your intake form</p>
      </div>

      <form onSubmit={handleSave} className="space-y-5">
        {/* Color & Font */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-6 py-4 border-b border-border bg-muted/20">
            <p className="font-semibold text-sm">Form Design</p>
          </div>
          <div className="px-6 py-5 space-y-4">
            <div className="space-y-1.5">
              <Label>Color scheme</Label>
              <div className="flex items-center gap-2">
                {[
                  { name: 'Orange', value: '#ff964f' },
                  { name: 'Teal', value: '#14b8a6' },
                  { name: 'Blue', value: '#3b82f6' },
                  { name: 'Purple', value: '#8b5cf6' },
                  { name: 'Rose', value: '#f43f5e' },
                  { name: 'Emerald', value: '#10b981' },
                ].map((color) => (
                  <button key={color.value} type="button" title={color.name} onClick={() => setIntakeAccentColor(color.value)} className={`w-8 h-8 rounded-full border-2 transition-all ${intakeAccentColor === color.value ? 'border-foreground scale-110' : 'border-transparent hover:border-muted-foreground/40'}`} style={{ backgroundColor: color.value }} />
                ))}
              </div>
              <p className="text-xs text-muted-foreground">Accent color used for buttons and highlights.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Border radius</Label>
              <div className="flex items-center gap-2">
                {[
                  { label: 'Rounded', value: 'rounded' as const },
                  { label: 'Sharp', value: 'sharp' as const },
                ].map((option) => (
                  <button key={option.value} type="button" onClick={() => setIntakeBorderRadius(option.value)} className={`px-4 py-2 text-sm font-medium border transition-colors ${option.value === 'rounded' ? 'rounded-xl' : 'rounded-none'} ${intakeBorderRadius === option.value ? 'border-primary bg-primary/10 text-foreground' : 'border-border bg-background text-muted-foreground hover:bg-muted'}`}>
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="intakeFont">Font</Label>
              <select id="intakeFont" value={intakeFont} onChange={(e) => setIntakeFont(e.target.value as any)} className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                <option value="system">System (default)</option>
                <option value="serif">Serif</option>
                <option value="mono">Mono</option>
              </select>
            </div>
          </div>
        </div>

        {/* Visual */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-6 py-4 border-b border-border bg-muted/20">
            <p className="font-semibold text-sm">Visual</p>
          </div>
          <div className="px-6 py-5 space-y-4">
            {/* Logo Upload */}
            <div className="space-y-2">
              <Label>Logo</Label>
              <p className="text-xs text-muted-foreground">Upload your business logo (PNG, JPEG, or SVG, max 2MB)</p>
              <div className="border-2 border-dashed border-border rounded-xl p-6 text-center hover:border-primary/50 transition-colors cursor-pointer" onClick={() => logoInputRef.current?.click()}>
                {logoPreview ? (
                  <img src={logoPreview} alt="Logo" className="h-16 mx-auto object-contain" />
                ) : (
                  <div className="space-y-1">
                    <Upload size={24} className="mx-auto text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Click to upload</p>
                  </div>
                )}
                <input ref={logoInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={handleLogoUpload} />
              </div>
            </div>

            {/* Header Background */}
            <div className="space-y-2">
              <Label>Header background</Label>
              <div className="flex items-center gap-3">
                <input type="color" value={intakeHeaderBgColor || '#ffffff'} onChange={(e) => { setIntakeHeaderBgColor(e.target.value); setIntakeHeaderGradient(''); }} className="w-10 h-10 rounded-md border border-border cursor-pointer" />
                <span className="text-xs text-muted-foreground">Solid color</span>
              </div>
              <div className="flex items-center gap-2 mt-2">
                {[
                  { label: 'None', value: '' },
                  { label: 'Warm sunset', value: 'linear-gradient(135deg, #f97316, #ec4899)' },
                  { label: 'Cool ocean', value: 'linear-gradient(135deg, #06b6d4, #3b82f6)' },
                  { label: 'Forest', value: 'linear-gradient(135deg, #22c55e, #14b8a6)' },
                ].map((preset) => (
                  <button key={preset.label} type="button" onClick={() => { setIntakeHeaderGradient(preset.value); if (preset.value) setIntakeHeaderBgColor(''); }} className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${intakeHeaderGradient === preset.value ? 'border-primary bg-primary/10 text-foreground' : 'border-border bg-background text-muted-foreground hover:bg-muted'}`}>
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Dark Mode */}
            <div className="flex items-center justify-between py-3 border-t border-border">
              <div>
                <p className="text-sm font-medium">Dark mode</p>
                <p className="text-xs text-muted-foreground">Enable dark mode for the intake form</p>
              </div>
              <Switch checked={intakeDarkMode} onCheckedChange={setIntakeDarkMode} />
            </div>

            {/* Favicon Upload */}
            <div className="space-y-2">
              <Label>Favicon</Label>
              <p className="text-xs text-muted-foreground">Upload a favicon for your intake page (PNG, ICO, or SVG, max 2MB)</p>
              <div className="border-2 border-dashed border-border rounded-xl p-4 text-center hover:border-primary/50 transition-colors cursor-pointer w-fit" onClick={() => faviconInputRef.current?.click()}>
                {faviconPreview ? (
                  <img src={faviconPreview} alt="Favicon" className="h-8 mx-auto object-contain" />
                ) : (
                  <div className="space-y-1 px-4">
                    <Upload size={18} className="mx-auto text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">Click to upload</p>
                  </div>
                )}
                <input ref={faviconInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={handleFaviconUpload} />
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={saving}>
            {saving ? (
              <><Loader2 size={14} className="mr-2 animate-spin" /> Saving...</>
            ) : saved ? 'Saved!' : 'Save appearance'}
          </Button>
          {saved && <p className="text-sm text-primary">Changes saved.</p>}
        </div>
      </form>
    </div>
  );
}
