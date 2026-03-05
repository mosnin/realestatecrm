'use client';

// This page uses client-side Clerk hooks for profile management
import { useUser } from '@clerk/nextjs';
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { UserButton } from '@clerk/nextjs';

export default function ProfilePage() {
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

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Profile</h2>
        <p className="text-muted-foreground">Manage your personal information</p>
      </div>

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
