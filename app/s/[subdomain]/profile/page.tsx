'use client';

// This page uses client-side Clerk hooks for profile management
import { useUser } from '@clerk/nextjs';
import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { UserButton } from '@clerk/nextjs';
import { Link2, ArrowUpRight } from 'lucide-react';
import { protocol, rootDomain } from '@/lib/utils';
import { CopyLinkButton } from '../copy-link-button';

export default function ProfilePage() {
  const params = useParams<{ subdomain: string }>();
  const { user, isLoaded } = useUser();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  if (!isLoaded) {
    return <div className="animate-pulse h-64 bg-muted rounded-lg" />;
  }

  if (!user) return null;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await user!.update({
        firstName: firstName || user!.firstName || undefined,
        lastName: lastName || user!.lastName || undefined
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  }

  const initials = [user.firstName?.[0], user.lastName?.[0]]
    .filter(Boolean)
    .join('')
    .toUpperCase() || user.emailAddresses[0]?.emailAddress?.[0]?.toUpperCase() || 'U';

  const subdomain = params?.subdomain;
  const applicationUrl = subdomain
    ? `${protocol}://${subdomain}.${rootDomain}/apply/${subdomain}`
    : '';

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Profile</h2>
        <p className="text-muted-foreground">Manage your personal information</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2 size={16} className="text-primary" />
            Public Application Link
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <code className="block text-xs md:text-sm bg-surface border border-border rounded-md px-3 py-2 break-all">
            {applicationUrl}
          </code>
          <div className="flex items-center gap-2">
            <CopyLinkButton url={applicationUrl} />
            <Button asChild variant="outline" size="sm">
              <Link href={applicationUrl} target="_blank" rel="noreferrer">
                Open link <ArrowUpRight size={14} className="ml-1" />
              </Link>
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Share this with prospects so new applications flow directly into your Leads view.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your Account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarImage src={user.imageUrl} />
              <AvatarFallback className="text-lg">{initials}</AvatarFallback>
            </Avatar>
            <div>
              <p className="font-semibold">
                {user.fullName ?? user.emailAddresses[0]?.emailAddress}
              </p>
              <p className="text-sm text-muted-foreground">
                {user.emailAddresses[0]?.emailAddress}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Manage photo and security settings below
              </p>
            </div>
          </div>

          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="firstName">First Name</Label>
                <Input
                  id="firstName"
                  defaultValue={user.firstName ?? ''}
                  onChange={(e) => setFirstName(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="lastName">Last Name</Label>
                <Input
                  id="lastName"
                  defaultValue={user.lastName ?? ''}
                  onChange={(e) => setLastName(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label>Email</Label>
              <Input value={user.emailAddresses[0]?.emailAddress ?? ''} disabled />
              <p className="text-xs text-muted-foreground">
                Email is managed via your Clerk account
              </p>
            </div>

            <Button type="submit" disabled={saving}>
              {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Changes'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Account Management</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Manage your avatar, password, and connected accounts.
          </p>
          <UserButton />
        </CardContent>
      </Card>
    </div>
  );
}
