'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Copy,
  Check,
  KeyRound,
  RefreshCw,
  Wrench,
  ExternalLink,
} from 'lucide-react';

interface UserActionsProps {
  userId: string;
  clerkId: string;
  email: string;
  isOnboarded: boolean;
  hasSpace: boolean;
  intakeUrl: string | null;
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleCopy}
      className="text-xs gap-1.5"
    >
      {copied ? <Check size={13} /> : <Copy size={13} />}
      {copied ? 'Copied!' : label}
    </Button>
  );
}

export function UserActions({
  userId,
  clerkId,
  email,
  isOnboarded,
  hasSpace,
  intakeUrl,
}: UserActionsProps) {
  const router = useRouter();
  const [resetLoading, setResetLoading] = useState(false);
  const [resetResult, setResetResult] = useState<string | null>(null);
  const [repairLoading, setRepairLoading] = useState(false);
  const [repairResult, setRepairResult] = useState<string | null>(null);
  const [repairOpen, setRepairOpen] = useState(false);

  async function handlePasswordReset() {
    setResetLoading(true);
    setResetResult(null);
    try {
      const res = await fetch('/api/admin/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send_password_reset', clerkId }),
      });
      const data = await res.json();
      if (res.ok) {
        setResetResult('Password reset email sent.');
      } else {
        setResetResult(data.error || 'Failed to send reset email.');
      }
    } catch {
      setResetResult('Network error. Try again.');
    } finally {
      setResetLoading(false);
    }
  }

  async function handleRepairOnboarding() {
    setRepairLoading(true);
    setRepairResult(null);
    try {
      const res = await fetch('/api/admin/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'repair_onboarding', userId }),
      });
      const data = await res.json();
      if (res.ok) {
        setRepairResult(data.message || 'Onboarding state repaired.');
        setRepairOpen(false);
        router.refresh();
      } else {
        setRepairResult(data.error || 'Repair failed.');
      }
    } catch {
      setRepairResult('Network error. Try again.');
    } finally {
      setRepairLoading(false);
    }
  }

  return (
    <div>
      <p className="text-sm font-semibold mb-3">Support actions</p>
      <Card>
        <CardContent className="px-5 py-4 space-y-4">
          {/* Copy actions */}
          <div className="flex flex-wrap gap-2">
            <CopyButton text={userId} label="Copy user ID" />
            <CopyButton text={clerkId} label="Copy Clerk ID" />
            <CopyButton text={email} label="Copy email" />
            {intakeUrl && (
              <>
                <CopyButton text={intakeUrl} label="Copy intake URL" />
                <a
                  href={intakeUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-md border border-border bg-card hover:bg-muted transition-colors"
                >
                  <ExternalLink size={13} />
                  Open intake page
                </a>
              </>
            )}
          </div>

          <div className="border-t border-border" />

          {/* Password reset */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Password reset</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Send a password reset email via Clerk
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handlePasswordReset}
              disabled={resetLoading}
              className="text-xs gap-1.5 flex-shrink-0"
            >
              <KeyRound size={13} />
              {resetLoading ? 'Sending...' : 'Send reset email'}
            </Button>
          </div>
          {resetResult && (
            <p className="text-xs text-muted-foreground">{resetResult}</p>
          )}

          <div className="border-t border-border" />

          {/* Repair onboarding */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Repair onboarding state</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isOnboarded && hasSpace
                  ? 'User state looks healthy.'
                  : isOnboarded && !hasSpace
                    ? 'User is onboarded but has no workspace. Repair will reset to re-onboard.'
                    : !isOnboarded && hasSpace
                      ? 'User has a workspace but is not marked as onboarded. Repair will backfill.'
                      : 'User has not completed onboarding.'}
              </p>
            </div>
            <Dialog open={repairOpen} onOpenChange={setRepairOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs gap-1.5 flex-shrink-0"
                >
                  <Wrench size={13} />
                  Repair state
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Repair onboarding state</DialogTitle>
                  <DialogDescription>
                    This will analyze the user&apos;s current state and apply the
                    appropriate fix:
                    <br />
                    <br />
                    {!isOnboarded && hasSpace ? (
                      <span className="font-medium">
                        Backfill: Set onboard=true since workspace exists.
                      </span>
                    ) : isOnboarded && !hasSpace ? (
                      <span className="font-medium">
                        Reset: Set onboard=false and onboardingCurrentStep=1 since
                        workspace is missing.
                      </span>
                    ) : (
                      <span className="font-medium">
                        Re-evaluate state and apply any needed correction.
                      </span>
                    )}
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setRepairOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button onClick={handleRepairOnboarding} disabled={repairLoading}>
                    <RefreshCw
                      size={14}
                      className={repairLoading ? 'animate-spin' : ''}
                    />
                    {repairLoading ? 'Repairing...' : 'Confirm repair'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
          {repairResult && (
            <p className="text-xs text-muted-foreground">{repairResult}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
