'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

type AssignmentMethod = 'manual' | 'round_robin' | 'score_based';

export default function BrokerSettingsAutoAssignmentPage() {
  const [enabled, setEnabled] = useState(false);
  const [method, setMethod] = useState<AssignmentMethod>('round_robin');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch('/api/broker/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          autoAssignEnabled: enabled,
          assignmentMethod: method,
        }),
      });
      if (res.ok) {
        setSaved(true);
        toast.success('Auto-assignment settings saved');
        setTimeout(() => setSaved(false), 2000);
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? 'Failed to save');
      }
    } catch {
      toast.error('Network error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Auto-Assignment</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Configure how new leads are automatically distributed to your realtors
        </p>
      </div>

      <Card>
        <CardContent className="px-5 py-5 space-y-5">
          {/* Enable toggle */}
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Enable auto-assignment</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Automatically assign new leads to available realtors
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              onClick={() => setEnabled(!enabled)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                enabled ? 'bg-primary' : 'bg-muted-foreground/30'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  enabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Assignment method */}
          {enabled && (
            <div className="space-y-3 pt-2 border-t border-border">
              <Label className="text-sm font-medium">Assignment method</Label>
              <div className="space-y-2">
                <label className="flex items-start gap-3 p-3 rounded-lg border border-border hover:bg-muted/50 cursor-pointer transition-colors">
                  <input
                    type="radio"
                    name="method"
                    value="round_robin"
                    checked={method === 'round_robin'}
                    onChange={() => setMethod('round_robin')}
                    className="mt-0.5"
                  />
                  <div>
                    <p className="text-sm font-medium">Round-robin</p>
                    <p className="text-xs text-muted-foreground">
                      Distribute leads evenly across all active realtors in rotation
                    </p>
                  </div>
                </label>
                <label className="flex items-start gap-3 p-3 rounded-lg border border-border hover:bg-muted/50 cursor-pointer transition-colors">
                  <input
                    type="radio"
                    name="method"
                    value="score_based"
                    checked={method === 'score_based'}
                    onChange={() => setMethod('score_based')}
                    className="mt-0.5"
                  />
                  <div>
                    <p className="text-sm font-medium">Score-based</p>
                    <p className="text-xs text-muted-foreground">
                      Assign leads to the realtor with the highest performance score and availability
                    </p>
                  </div>
                </label>
                <label className="flex items-start gap-3 p-3 rounded-lg border border-border hover:bg-muted/50 cursor-pointer transition-colors">
                  <input
                    type="radio"
                    name="method"
                    value="manual"
                    checked={method === 'manual'}
                    onChange={() => setMethod('manual')}
                    className="mt-0.5"
                  />
                  <div>
                    <p className="text-sm font-medium">Manual only</p>
                    <p className="text-xs text-muted-foreground">
                      All leads stay unassigned until a broker admin manually assigns them
                    </p>
                  </div>
                </label>
              </div>
            </div>
          )}

          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? (
              <><Loader2 size={14} className="mr-1.5 animate-spin" /> Saving...</>
            ) : saved ? (
              <><CheckCircle2 size={14} className="mr-1.5" /> Saved</>
            ) : (
              'Save changes'
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
