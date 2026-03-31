'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Loader2, Plus, Trash2, Lock } from 'lucide-react';
import { toast } from 'sonner';

const FORM_STEPS = [
  { id: 'property', label: 'Property Selection', locked: true },
  { id: 'about', label: 'About You', locked: true },
  { id: 'housing', label: 'Current Housing', locked: false },
  { id: 'household', label: 'Household', locked: false },
  { id: 'income', label: 'Income', locked: false },
  { id: 'history', label: 'Rental History', locked: false },
  { id: 'screening', label: 'Screening', locked: false },
  { id: 'details', label: 'Additional Notes', locked: false },
  { id: 'documents', label: 'Documents', locked: false },
  { id: 'submit', label: 'Review & Submit', locked: true },
];

type CustomQuestion = { id: string; label: string; placeholder?: string; required?: boolean };

export default function FormFieldsSettingsPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? '';

  const [disabledSteps, setDisabledSteps] = useState<string[]>([]);
  const [customQuestions, setCustomQuestions] = useState<CustomQuestion[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) return;
    fetch(`/api/spaces?slug=${encodeURIComponent(slug)}`)
      .then((r) => r.json())
      .then((data) => {
        const s = data.settings ?? data;
        setDisabledSteps(s.intakeDisabledSteps ?? []);
        setCustomQuestions(s.intakeCustomQuestions ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [slug]);

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
          intakeDisabledSteps: disabledSteps,
          intakeCustomQuestions: customQuestions,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Failed to save form field settings.');
      }
      setSaved(true);
      toast.success('Form field settings saved.');
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
        <h1 className="text-xl font-semibold tracking-tight">Form Fields</h1>
        <p className="text-muted-foreground text-sm">Toggle intake form steps and add custom questions</p>
      </div>

      <form onSubmit={handleSave} className="space-y-5">
        {/* Step toggles */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-6 py-4 border-b border-border bg-muted/20">
            <p className="font-semibold text-sm">Form steps</p>
            <p className="text-xs text-muted-foreground mt-0.5">Toggle steps on or off. Disabled steps are hidden from the intake form.</p>
          </div>
          <div className="px-6 py-5">
            <div className="space-y-0">
              {FORM_STEPS.map((step) => {
                const isDisabled = disabledSteps.includes(step.id);
                return (
                  <div key={step.id} className="flex items-center justify-between py-2.5 border-b border-border last:border-b-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{step.label}</p>
                      {step.locked && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                          <Lock size={10} /> Required
                        </span>
                      )}
                    </div>
                    <Switch
                      checked={step.locked ? true : !isDisabled}
                      disabled={step.locked}
                      onCheckedChange={(checked) => {
                        if (step.locked) return;
                        if (checked) {
                          setDisabledSteps(disabledSteps.filter((s) => s !== step.id));
                        } else {
                          setDisabledSteps([...disabledSteps, step.id]);
                        }
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Custom questions */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-6 py-4 border-b border-border bg-muted/20">
            <p className="font-semibold text-sm">Custom questions</p>
            <p className="text-xs text-muted-foreground mt-0.5">Add your own questions that appear at the end of the form.</p>
          </div>
          <div className="px-6 py-5 space-y-3">
            {customQuestions.map((q, index) => (
              <div key={q.id} className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <Input
                    value={q.label}
                    onChange={(e) => {
                      const updated = [...customQuestions];
                      updated[index] = { ...updated[index], label: e.target.value };
                      setCustomQuestions(updated);
                    }}
                    placeholder="Enter your question..."
                    className="flex-1"
                  />
                  <button type="button" onClick={() => setCustomQuestions(customQuestions.filter((_, i) => i !== index))} className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-md border border-border text-muted-foreground hover:text-destructive hover:border-destructive/40 transition-colors">
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="flex items-center gap-3">
                  <Input
                    value={q.placeholder || ''}
                    onChange={(e) => {
                      const updated = [...customQuestions];
                      updated[index] = { ...updated[index], placeholder: e.target.value };
                      setCustomQuestions(updated);
                    }}
                    placeholder="Placeholder text (optional)"
                    className="flex-1 text-xs"
                  />
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className="text-xs text-muted-foreground">Required</span>
                    <Switch
                      checked={q.required || false}
                      onCheckedChange={(checked) => {
                        const updated = [...customQuestions];
                        updated[index] = { ...updated[index], required: checked };
                        setCustomQuestions(updated);
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
            <button type="button" onClick={() => setCustomQuestions([...customQuestions, { id: crypto.randomUUID(), label: '', required: false }])} className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors">
              <Plus size={14} /> Add question
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={saving}>
            {saving ? (
              <><Loader2 size={14} className="mr-2 animate-spin" /> Saving...</>
            ) : saved ? 'Saved!' : 'Save form fields'}
          </Button>
          {saved && <p className="text-sm text-primary">Changes saved.</p>}
        </div>
      </form>
    </div>
  );
}
