'use client';

import {
  Inbox,
  Search,
  CheckCircle2,
  AlertCircle,
  XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ApplicationStatusClientProps {
  contact: {
    name: string;
    status: string;
    statusNote: string | null;
    createdAt: string;
  };
  businessName: string;
}

const STATUSES = [
  { key: 'received', label: 'Received', icon: Inbox, color: 'text-blue-500', bgColor: 'bg-blue-100 dark:bg-blue-900/30' },
  { key: 'under_review', label: 'Under Review', icon: Search, color: 'text-amber-500', bgColor: 'bg-amber-100 dark:bg-amber-900/30' },
  { key: 'approved', label: 'Approved', icon: CheckCircle2, color: 'text-emerald-500', bgColor: 'bg-emerald-100 dark:bg-emerald-900/30' },
  { key: 'needs_info', label: 'Needs Info', icon: AlertCircle, color: 'text-orange-500', bgColor: 'bg-orange-100 dark:bg-orange-900/30' },
  { key: 'declined', label: 'Declined', icon: XCircle, color: 'text-red-500', bgColor: 'bg-red-100 dark:bg-red-900/30' },
];

export function ApplicationStatusClient({ contact, businessName }: ApplicationStatusClientProps) {
  const currentIndex = STATUSES.findIndex((s) => s.key === contact.status);
  const isTerminal = ['approved', 'declined'].includes(contact.status);

  // Show the relevant progression (received -> under_review -> approved/needs_info/declined)
  const progressSteps = STATUSES.filter((s) => {
    if (s.key === 'needs_info' && contact.status !== 'needs_info') return false;
    if (s.key === 'declined' && contact.status !== 'declined') return false;
    if (s.key === 'approved' && contact.status === 'declined') return false;
    return true;
  });

  return (
    <div className="w-full max-w-md">
      <div className="rounded-xl bg-card border border-border/60 shadow-sm p-6 space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-xl font-semibold">Application Status</h1>
          <p className="text-sm text-muted-foreground">
            for {contact.name}
          </p>
          <p className="text-xs text-muted-foreground">
            Submitted {new Date(contact.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          </p>
        </div>

        {/* Current status */}
        {(() => {
          const current = STATUSES.find((s) => s.key === contact.status) || STATUSES[0];
          const Icon = current.icon;
          return (
            <div className={cn('rounded-xl p-5 text-center', current.bgColor)}>
              <Icon size={32} className={cn('mx-auto mb-2', current.color)} />
              <p className={cn('text-lg font-semibold', current.color)}>{current.label}</p>
              {contact.statusNote && (
                <p className="text-sm text-foreground mt-2">{contact.statusNote}</p>
              )}
            </div>
          );
        })()}

        {/* Progress tracker */}
        <div className="space-y-0">
          {progressSteps.map((step, i) => {
            const Icon = step.icon;
            const stepIdx = STATUSES.findIndex((s) => s.key === step.key);
            const isCurrent = step.key === contact.status;
            const isPast = stepIdx < currentIndex;
            const isLast = i === progressSteps.length - 1;

            return (
              <div key={step.key} className="flex items-start gap-3">
                <div className="flex flex-col items-center">
                  <div className={cn(
                    'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0',
                    isPast || isCurrent ? step.bgColor : 'bg-muted'
                  )}>
                    <Icon size={14} className={cn(isPast || isCurrent ? step.color : 'text-muted-foreground/30')} />
                  </div>
                  {!isLast && (
                    <div className={cn('w-px h-6', isPast ? 'bg-emerald-300 dark:bg-emerald-700' : 'bg-border')} />
                  )}
                </div>
                <div className="pt-1.5">
                  <p className={cn(
                    'text-sm font-medium',
                    isCurrent ? 'text-foreground' : isPast ? 'text-muted-foreground' : 'text-muted-foreground/40'
                  )}>
                    {step.label}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* What happens next */}
        <div className="rounded-xl bg-muted/30 p-4 space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">What happens next?</p>
          {contact.status === 'received' && (
            <p className="text-sm text-muted-foreground">{businessName} will review your application and may reach out with questions. This typically takes 1-3 business days.</p>
          )}
          {contact.status === 'under_review' && (
            <p className="text-sm text-muted-foreground">Your application is actively being reviewed. {businessName} may contact you for additional information. Hang tight!</p>
          )}
          {contact.status === 'approved' && (
            <p className="text-sm text-muted-foreground">Congratulations! {businessName} will reach out with next steps, including lease signing details.</p>
          )}
          {contact.status === 'needs_info' && (
            <p className="text-sm text-muted-foreground">{businessName} needs additional information to process your application. Please check your email or phone for details.</p>
          )}
          {contact.status === 'declined' && (
            <p className="text-sm text-muted-foreground">Unfortunately your application was not approved at this time. {businessName} may provide more details separately.</p>
          )}
        </div>

        <p className="text-xs text-muted-foreground text-center">
          Questions? Contact {businessName} directly.
        </p>
      </div>
    </div>
  );
}
