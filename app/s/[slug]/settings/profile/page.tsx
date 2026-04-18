'use client';

import { useUser } from '@clerk/nextjs';
import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { UserButton } from '@clerk/nextjs';
import { Loader2, Upload, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import { generatePrivacyPolicy } from '@/lib/privacy-policy-template';

export default function ProfileSettingsPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? '';
  const { user, isLoaded } = useUser();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [bio, setBio] = useState('');
  const [socialLinks, setSocialLinks] = useState<{ instagram?: string; linkedin?: string; facebook?: string }>({ instagram: '', linkedin: '', facebook: '' });
  const [phone, setPhone] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [realtorPhotoUrl, setRealtorPhotoUrl] = useState('');
  const [privacyPolicyHtml, setPrivacyPolicyHtml] = useState('');
  const [photoUploading, setPhotoUploading] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  // Sync Clerk user data
  useEffect(() => {
    if (isLoaded && user && !initialized) {
      setFirstName(user.firstName ?? '');
      setLastName(user.lastName ?? '');
      setInitialized(true);
    }
  }, [isLoaded, user, initialized]);

  // Fetch space settings for profile fields
  useEffect(() => {
    if (!slug) return;
    fetch(`/api/spaces?slug=${encodeURIComponent(slug)}`)
      .then((r) => r.json())
      .then((data) => {
        const s = data.settings ?? data;
        setBio(s.bio ?? '');
        setSocialLinks(s.socialLinks ?? { instagram: '', linkedin: '', facebook: '' });
        setPhone(s.phoneNumber ?? '');
        setBusinessName(s.businessName ?? '');
        setRealtorPhotoUrl(s.realtorPhotoUrl ?? '');
        setPrivacyPolicyHtml(s.privacyPolicyHtml ?? '');
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [slug]);

  if (!isLoaded || !initialized || loading) {
    return (
      <div className="space-y-4 max-w-3xl animate-pulse">
        <div className="h-8 bg-muted rounded-lg w-32" />
        <div className="h-40 bg-muted rounded-lg" />
      </div>
    );
  }

  if (!user) return null;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      // Update Clerk profile (firstName/lastName)
      try {
        await user!.update({ firstName, lastName });
      } catch (clerkErr) {
        // Clerk v7+ may reject first_name/last_name on certain API versions.
        // The name is also saved to the DB via save_profile below, so this is non-fatal.
        console.warn('[profile] Clerk user.update() failed, saving name to DB only:', clerkErr);
      }

      // Update space settings (bio, social links, photo, phone, businessName, privacyPolicyHtml)
      const res = await fetch('/api/spaces', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          bio: bio.trim() || null,
          socialLinks,
          realtorPhotoUrl: realtorPhotoUrl.trim() || null,
          privacyPolicyHtml: privacyPolicyHtml || null,
          phoneNumber: phone,
          businessName,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Failed to save profile settings.');
      }

      // Save the user's name to their User record
      const profileRes = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save_profile', name: `${firstName} ${lastName}`.trim(), phone, businessName }),
      });
      if (!profileRes.ok) {
        const d = await profileRes.json().catch(() => ({}));
        throw new Error(d.error || 'Failed to save profile.');
      }

      setSaved(true);
      toast.success('Profile saved.');
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  }

  const initials = [user.firstName?.[0], user.lastName?.[0]]
    .filter(Boolean)
    .join('')
    .toUpperCase() || 'U';

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Profile</h1>
        <p className="text-muted-foreground text-sm">Your personal information, bio, and social links</p>
      </div>

      <form onSubmit={handleSave} className="space-y-5">
        {/* Account info */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-6 py-4 border-b border-border bg-muted/20">
            <p className="font-semibold text-sm">Your account</p>
          </div>
          <div className="px-6 py-5 space-y-5">
            <div className="flex items-center gap-4">
              <Avatar className="h-14 w-14 ring-2 ring-border">
                <AvatarImage src={user.imageUrl} />
                <AvatarFallback className="text-base font-semibold bg-primary/10 text-primary">{initials}</AvatarFallback>
              </Avatar>
              <div>
                <p className="font-semibold text-sm">{user.fullName ?? user.emailAddresses[0]?.emailAddress}</p>
                <p className="text-sm text-muted-foreground">{user.emailAddresses[0]?.emailAddress}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="firstName">First name</Label>
                <Input id="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lastName">Last name</Label>
                <Input id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input value={user.emailAddresses[0]?.emailAddress ?? ''} disabled />
              <p className="text-xs text-muted-foreground">Email is managed via your Clerk account.</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone number</Label>
              <Input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(555) 123-4567" />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="businessName">Business name</Label>
              <Input id="businessName" value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Preston Leasing" />
            </div>
          </div>
        </div>

        {/* Bio & Social */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-6 py-4 border-b border-border bg-muted/20">
            <p className="font-semibold text-sm">Bio &amp; social links</p>
            <p className="text-xs text-muted-foreground mt-0.5">Displayed on your intake page.</p>
          </div>
          <div className="px-6 py-5 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="bio">Bio</Label>
              <Textarea id="bio" value={bio} onChange={(e) => setBio(e.target.value)} placeholder="A short bio shown on your intake page..." rows={3} />
            </div>
            <div className="space-y-1.5">
              <Label>Profile photo</Label>
              <div
                className="relative flex items-center gap-4 rounded-lg border-2 border-dashed border-border p-4 hover:border-primary/50 transition-colors cursor-pointer"
                onClick={() => document.getElementById('photo-upload')?.click()}
              >
                {realtorPhotoUrl ? (
                  <img src={realtorPhotoUrl} alt="Photo preview" className="w-14 h-14 rounded-full object-cover ring-2 ring-border" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                ) : (
                  <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center">
                    <Upload size={20} className="text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{realtorPhotoUrl ? 'Change photo' : 'Upload photo'}</p>
                  <p className="text-xs text-muted-foreground">PNG, JPG, or WebP. Max 2MB.</p>
                </div>
                {photoUploading && <Loader2 size={16} className="animate-spin text-muted-foreground" />}
              </div>
              <input
                id="photo-upload"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  if (file.size > 2 * 1024 * 1024) { toast.error('File must be under 2MB'); return; }
                  setPhotoUploading(true);
                  try {
                    const formData = new FormData();
                    formData.append('file', file);
                    formData.append('type', 'photo');
                    const res = await fetch('/api/upload', { method: 'POST', body: formData });
                    const data = await res.json();
                    if (res.ok && data.url) {
                      setRealtorPhotoUrl(data.url);
                      toast.success('Photo uploaded');
                    } else {
                      toast.error(data.error || 'Upload failed');
                    }
                  } catch { toast.error('Upload failed'); }
                  finally { setPhotoUploading(false); }
                }}
              />
              <p className="text-xs text-muted-foreground">Your professional headshot shown on public pages.</p>
            </div>
            <div className="space-y-2">
              <Label>Social links</Label>
              <Input value={socialLinks.instagram || ''} onChange={(e) => setSocialLinks({ ...socialLinks, instagram: e.target.value })} placeholder="Instagram URL" />
              <Input value={socialLinks.linkedin || ''} onChange={(e) => setSocialLinks({ ...socialLinks, linkedin: e.target.value })} placeholder="LinkedIn URL" />
              <Input value={socialLinks.facebook || ''} onChange={(e) => setSocialLinks({ ...socialLinks, facebook: e.target.value })} placeholder="Facebook URL" />
            </div>
          </div>
        </div>

        {/* Privacy Policy */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-6 py-4 border-b border-border bg-muted/20">
            <p className="font-semibold text-sm">Privacy Policy</p>
            <p className="text-xs text-muted-foreground mt-0.5">Displayed on your intake page. Protects you and your clients.</p>
          </div>
          <div className="px-6 py-5 space-y-4">
            <div className="flex items-center justify-between">
              <Label>Privacy policy content</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const name = businessName || `${firstName} ${lastName}`.trim() || 'Our Office';
                  setPrivacyPolicyHtml(generatePrivacyPolicy(name, 'realtor'));
                  toast.success('Privacy policy template generated');
                }}
              >
                <Sparkles size={14} className="mr-1.5" />
                Generate template
              </Button>
            </div>
            <RichTextEditor
              value={privacyPolicyHtml}
              onChange={setPrivacyPolicyHtml}
              placeholder="Enter your privacy policy here or click 'Generate template' to start with a comprehensive template..."
            />
            <p className="text-xs text-muted-foreground">
              This privacy policy will be linked on your intake forms. You are responsible for ensuring it complies with applicable laws in your jurisdiction.
            </p>
          </div>
        </div>

        {/* Account management */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-6 py-4 border-b border-border bg-muted/20">
            <p className="font-semibold text-sm">Account management</p>
          </div>
          <div className="px-6 py-5">
            <p className="text-sm text-muted-foreground mb-4">Manage your avatar, password, and connected accounts.</p>
            <UserButton />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={saving}>
            {saving ? (
              <><Loader2 size={14} className="mr-2 animate-spin" /> Saving...</>
            ) : saved ? 'Saved!' : 'Save changes'}
          </Button>
          {saved && <p className="text-sm text-primary">Changes saved.</p>}
        </div>
      </form>
    </div>
  );
}
