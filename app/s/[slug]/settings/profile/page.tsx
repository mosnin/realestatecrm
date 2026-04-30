'use client';

import { useUser } from '@clerk/nextjs';
import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { UserButton } from '@clerk/nextjs';
import { Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import { generatePrivacyPolicy } from '@/lib/privacy-policy-template';
import {
  H2,
  SECTION_LABEL,
  BODY_MUTED,
  CAPTION,
  PRIMARY_PILL,
  SECTION_RHYTHM,
  READING_MAX,
} from '@/lib/typography';

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className={SECTION_LABEL}>{children}</p>;
}

export default function ProfileSettingsPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? '';
  const { user, isLoaded } = useUser();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [bio, setBio] = useState('');
  const [socialLinks, setSocialLinks] = useState<{ instagram?: string; linkedin?: string; facebook?: string }>({
    instagram: '',
    linkedin: '',
    facebook: '',
  });
  const [phone, setPhone] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [realtorPhotoUrl, setRealtorPhotoUrl] = useState('');
  const [privacyPolicyHtml, setPrivacyPolicyHtml] = useState('');
  const [photoUploading, setPhotoUploading] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isLoaded && user && !initialized) {
      setFirstName(user.firstName ?? '');
      setLastName(user.lastName ?? '');
      setInitialized(true);
    }
  }, [isLoaded, user, initialized]);

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
      <div className="space-y-6 max-w-3xl animate-pulse">
        <div className="h-8 bg-foreground/[0.04] rounded-md w-32" />
        <div className="h-40 bg-foreground/[0.04] rounded-md" />
      </div>
    );
  }

  if (!user) return null;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      try {
        await user!.update({ firstName, lastName });
      } catch (clerkErr) {
        console.warn('[profile] Clerk user.update() failed, saving name to DB only:', clerkErr);
      }

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

      const profileRes = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_profile',
          name: `${firstName} ${lastName}`.trim(),
          phone,
          businessName,
        }),
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

  const initials =
    [user.firstName?.[0], user.lastName?.[0]]
      .filter(Boolean)
      .join('')
      .toUpperCase() || 'U';

  return (
    <div className={`${SECTION_RHYTHM} ${READING_MAX}`}>
      <h2 className={H2}>Profile</h2>

      <form onSubmit={handleSave} className="space-y-10">
        {/* Identity */}
        <section className="space-y-5">
          <SectionLabel>Identity</SectionLabel>
          <div className="flex items-center gap-4">
            {user.imageUrl ? (
              <img
                src={user.imageUrl}
                alt=""
                className="h-14 w-14 rounded-full object-cover bg-foreground/[0.06]"
              />
            ) : (
              <div className="h-14 w-14 rounded-full bg-foreground/[0.06] flex items-center justify-center text-base font-medium text-foreground">
                {initials}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">
                {user.fullName ?? user.emailAddresses[0]?.emailAddress}
              </p>
              <p className="text-sm text-muted-foreground truncate">
                {user.emailAddresses[0]?.emailAddress}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="firstName" className="text-[12.5px] font-medium text-foreground">
                First name
              </Label>
              <Input id="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lastName" className="text-[12.5px] font-medium text-foreground">
                Last name
              </Label>
              <Input id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[12.5px] font-medium text-foreground">Email</Label>
            <Input value={user.emailAddresses[0]?.emailAddress ?? ''} disabled />
            <p className={CAPTION}>Email is managed via your Clerk account.</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="phone" className="text-[12.5px] font-medium text-foreground">
              Phone number
            </Label>
            <Input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(555) 123-4567" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="businessName" className="text-[12.5px] font-medium text-foreground">
              Business name
            </Label>
            <Input id="businessName" value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Preston Leasing" />
          </div>
        </section>

        {/* Bio & social */}
        <section className="space-y-5 pt-8 border-t border-border/60">
          <SectionLabel>Bio &amp; social</SectionLabel>
          <p className={CAPTION}>Displayed on your intake page.</p>

          <div className="space-y-1.5">
            <Label htmlFor="bio" className="text-[12.5px] font-medium text-foreground">
              Bio
            </Label>
            <Textarea
              id="bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="A short bio shown on your intake page..."
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-[12.5px] font-medium text-foreground">Profile photo</Label>
            <div className="flex items-center gap-4">
              {realtorPhotoUrl ? (
                <img
                  src={realtorPhotoUrl}
                  alt=""
                  className="h-14 w-14 rounded-full object-cover bg-foreground/[0.06]"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              ) : (
                <div className="h-14 w-14 rounded-full bg-foreground/[0.06]" />
              )}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => document.getElementById('photo-upload')?.click()}
                  disabled={photoUploading}
                  className="text-sm text-foreground hover:text-foreground/80 underline-offset-4 hover:underline transition-colors duration-150 disabled:opacity-60"
                >
                  {photoUploading ? 'Uploading…' : realtorPhotoUrl ? 'Change photo' : 'Upload photo'}
                </button>
                {photoUploading && <Loader2 size={14} className="animate-spin text-muted-foreground" />}
              </div>
            </div>
            <input
              id="photo-upload"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (file.size > 2 * 1024 * 1024) {
                  toast.error('File must be under 2MB');
                  return;
                }
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
                } catch {
                  toast.error('Upload failed');
                } finally {
                  setPhotoUploading(false);
                }
              }}
            />
            <p className={CAPTION}>PNG, JPG, or WebP. Max 2MB.</p>
          </div>

          <div className="space-y-2">
            <Label className="text-[12.5px] font-medium text-foreground">Social links</Label>
            <Input
              value={socialLinks.instagram || ''}
              onChange={(e) => setSocialLinks({ ...socialLinks, instagram: e.target.value })}
              placeholder="Instagram URL"
            />
            <Input
              value={socialLinks.linkedin || ''}
              onChange={(e) => setSocialLinks({ ...socialLinks, linkedin: e.target.value })}
              placeholder="LinkedIn URL"
            />
            <Input
              value={socialLinks.facebook || ''}
              onChange={(e) => setSocialLinks({ ...socialLinks, facebook: e.target.value })}
              placeholder="Facebook URL"
            />
          </div>
        </section>

        {/* Privacy policy */}
        <section className="space-y-5 pt-8 border-t border-border/60">
          <div className="flex items-center justify-between gap-3">
            <SectionLabel>Privacy policy</SectionLabel>
            <button
              type="button"
              onClick={() => {
                const name = businessName || `${firstName} ${lastName}`.trim() || 'Our Office';
                setPrivacyPolicyHtml(generatePrivacyPolicy(name, 'realtor'));
                toast.success('Privacy policy template generated');
              }}
              className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-xs font-medium text-foreground hover:bg-foreground/[0.04] transition-colors duration-150"
            >
              <Sparkles size={12} />
              Generate template
            </button>
          </div>
          <p className={CAPTION}>
            Linked on your intake forms. You are responsible for ensuring it complies with applicable laws.
          </p>
          <RichTextEditor
            value={privacyPolicyHtml}
            onChange={setPrivacyPolicyHtml}
            placeholder="Enter your privacy policy here or click 'Generate template' to start with a comprehensive template..."
          />
        </section>

        {/* Account */}
        <section className="space-y-5 pt-8 border-t border-border/60">
          <SectionLabel>Account</SectionLabel>
          <div className="space-y-3">
            <p className={BODY_MUTED}>Manage your avatar, password, and connected accounts.</p>
            <UserButton />
          </div>
        </section>

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={saving}
            className={cn(PRIMARY_PILL, 'disabled:opacity-60 disabled:cursor-not-allowed')}
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {saving ? 'Saving' : saved ? 'Saved' : 'Save changes'}
          </button>
          {saved && <p className={BODY_MUTED}>Changes saved.</p>}
        </div>
      </form>
    </div>
  );
}
