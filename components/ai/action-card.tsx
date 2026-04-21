'use client';

import { useState, useEffect } from 'react';
import { Check, X, Loader2, Users, Briefcase, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface CRMAction {
  type: 'update_contact' | 'update_deal';
  id: string;
  summary: string;
  changes: Record<string, unknown>;
}

export interface ActionResult {
  ok: boolean;
  error?: string;
}

interface ActionCardProps {
  action: CRMAction;
  initialApplied?: boolean;
  onApprove: (action: CRMAction) => Promise<ActionResult>;
}

export function ActionCard({ action, initialApplied, onApprove }: ActionCardProps) {
  const [status, setStatus] = useState<'pending' | 'loading' | 'approved' | 'rejected' | 'error'>(
    initialApplied ? 'approved' : 'pending'
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Auto-clear error after 8 seconds so user can retry
  useEffect(() => {
    if (status === 'error') {
      const t = setTimeout(() => setStatus('pending'), 8000);
      return () => clearTimeout(t);
    }
  }, [status]);

  const isContact = action.type === 'update_contact';
  const Icon = isContact ? Users : Briefcase;
  const label = isContact ? 'Update Contact' : 'Update Deal';

  async function handleApprove() {
    setStatus('loading');
    setErrorMessage(null);
    try {
      const result = await onApprove(action);
      if (result.ok) {
        setStatus('approved');
      } else {
        setStatus('error');
        setErrorMessage(result.error ?? null);
      }
    } catch {
      setStatus('error');
      setErrorMessage('Network error — check your connection');
    }
  }

  const changeEntries = Object.entries(action.changes);

  return (
    <div className={cn(
      'my-2 rounded-lg border text-sm overflow-hidden',
      status === 'approved' ? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50/50 dark:bg-emerald-900/20' :
      status === 'rejected' ? 'border-border bg-muted/30 opacity-60' :
      status === 'error' ? 'border-red-300 dark:border-red-700 bg-red-50/50 dark:bg-red-900/20' :
      'border-border bg-background'
    )}>
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border/60 bg-muted/30">
        <Icon size={14} className="text-muted-foreground" />
        <span className="font-medium text-xs">{label}</span>
        {status === 'approved' && <span className="ml-auto text-xs text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1"><Check size={12} /> Applied</span>}
        {status === 'rejected' && <span className="ml-auto text-xs text-muted-foreground">Dismissed</span>}
      </div>

      <div className="px-3 py-2 space-y-1">
        <p className="text-xs text-muted-foreground">{action.summary}</p>
        {changeEntries.length > 0 && (
          <div className="mt-1.5 space-y-0.5">
            {changeEntries.map(([key, val]) => (
              <div key={key} className="flex items-baseline gap-2 text-xs">
                <span className="text-muted-foreground font-mono">{key}:</span>
                <span className="font-medium">{Array.isArray(val) ? val.join(', ') : String(val)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {status === 'pending' && (
        <div className="flex items-center gap-2 px-3 py-2 border-t border-border/60">
          <button
            onClick={handleApprove}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
          >
            <Check size={12} />
            Approve
          </button>
          <button
            onClick={() => setStatus('rejected')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium hover:bg-muted transition-colors"
          >
            <X size={12} />
            Dismiss
          </button>
        </div>
      )}

      {status === 'loading' && (
        <div className="flex items-center gap-2 px-3 py-2 border-t border-border/60 text-xs text-muted-foreground">
          <Loader2 size={12} className="animate-spin" />
          Applying changes...
        </div>
      )}

      {status === 'error' && (
        <div className="px-3 py-2 border-t border-border/60 text-xs text-red-600 dark:text-red-400 space-y-1">
          <div className="flex items-center gap-2">
            <AlertCircle size={12} className="flex-shrink-0" />
            <span>{errorMessage || 'Failed to apply changes.'} Click Approve to retry.</span>
          </div>
        </div>
      )}
    </div>
  );
}
