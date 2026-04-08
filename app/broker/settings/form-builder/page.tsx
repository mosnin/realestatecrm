'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Loader2,
  Save,
  RotateCcw,
  Eye,
  Pencil,
  Home,
  Users,
  Send,
  CheckCircle2,
  AlertCircle,
  Info,
} from 'lucide-react';
import { toast } from 'sonner';
import { FormBuilder } from '@/components/form-builder';
import { FormPreview } from '@/components/form-builder/form-preview';
import { TEMPLATES } from '@/components/form-builder/templates';
import type { IntakeFormConfig } from '@/components/form-builder/types';
import type { TemplateName } from '@/components/form-builder/templates';

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

/** Human-friendly labels for each form type */
const FORM_TYPE_LABELS: Record<string, string> = {
  rental: 'Rental Application',
  buyer: 'Buyer Inquiry',
  general: 'General Intake',
};

/** Detect which standard template the config matches, if any */
function detectActiveTemplate(config: IntakeFormConfig): TemplateName | null {
  return config.leadType === 'rental'
    ? 'rental'
    : config.leadType === 'buyer'
      ? 'buyer'
      : null;
}

export default function BrokerFormBuilderPage() {
  const [config, setConfig] = useState<IntakeFormConfig>(deepClone(TEMPLATES.rental.config));
  const [saving, setSaving] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string>('builder');
  const [hasChanges, setHasChanges] = useState(false);
  const [hasSavedConfig, setHasSavedConfig] = useState(false);
  const [memberCount, setMemberCount] = useState<number | null>(null);

  // Track the last-saved config to detect unsaved changes accurately
  const savedConfigRef = useRef<string>('');

  // Load existing config
  useEffect(() => {
    fetch('/api/broker/form-config')
      .then((r) => {
        if (!r.ok) throw new Error('Not found');
        return r.json();
      })
      .then((data: { brokerageId: string; formConfig: IntakeFormConfig | null }) => {
        if (data.formConfig?.sections) {
          setConfig(data.formConfig);
          setHasSavedConfig(true);
          savedConfigRef.current = JSON.stringify(data.formConfig);
        } else {
          const defaultConfig = deepClone(TEMPLATES.rental.config);
          setConfig(defaultConfig);
          setHasSavedConfig(false);
          savedConfigRef.current = JSON.stringify(defaultConfig);
        }
      })
      .catch(() => {
        // Network error or no existing config -- start with rental default
        const defaultConfig = deepClone(TEMPLATES.rental.config);
        setConfig(defaultConfig);
        savedConfigRef.current = JSON.stringify(defaultConfig);
      })
      .finally(() => setLoading(false));
  }, []);

  // Fetch member count for the "Push to Members" section
  useEffect(() => {
    fetch('/api/broker/stats')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.memberCount != null) {
          setMemberCount(data.memberCount);
        }
      })
      .catch(() => {
        // Silently fail -- member count is informational
      });
  }, []);

  const handleConfigChange = useCallback((newConfig: IntakeFormConfig) => {
    setConfig(newConfig);
    setHasChanges(JSON.stringify(newConfig) !== savedConfigRef.current);
  }, []);

  const handleSwitchTemplate = useCallback((name: TemplateName) => {
    const template = TEMPLATES[name];
    const newConfig = deepClone(template.config);
    setConfig(newConfig);
    setHasChanges(JSON.stringify(newConfig) !== savedConfigRef.current);
    toast.success(`Switched to ${FORM_TYPE_LABELS[template.config.leadType] ?? template.label} form`);
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/broker/form-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formConfig: config }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Failed to save form configuration.');
      }
      setHasSavedConfig(true);
      setHasChanges(false);
      savedConfigRef.current = JSON.stringify(config);
      toast.success('Brokerage form saved successfully.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  }, [config]);

  const handleReset = useCallback(async () => {
    if (
      !confirm(
        'Reset to the standard Chippi rental form? Your custom brokerage form will be removed.',
      )
    )
      return;
    try {
      const res = await fetch('/api/broker/form-config', {
        method: 'DELETE',
      });
      if (!res.ok) {
        throw new Error('Failed to reset form configuration.');
      }
      const defaultConfig = deepClone(TEMPLATES.rental.config);
      setConfig(defaultConfig);
      setHasSavedConfig(false);
      setHasChanges(false);
      savedConfigRef.current = JSON.stringify(defaultConfig);
      toast.success('Form reset to the standard Chippi default.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong.');
    }
  }, []);

  const handlePushToMembers = useCallback(async () => {
    const memberLabel = memberCount != null ? `${memberCount} member${memberCount === 1 ? '' : 's'}` : 'all member realtors';
    if (
      !confirm(
        `This will override the individual form settings for ${memberLabel} with this brokerage form. Their formConfigSource will be set to "brokerage". Continue?`,
      )
    )
      return;
    setPushing(true);
    try {
      const res = await fetch('/api/broker/form-config/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formConfig: config }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Failed to push form to members.');
      }
      toast.success(`Form configuration pushed to ${memberLabel}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setPushing(false);
    }
  }, [config, memberCount]);

  // Derived display values
  const activeTemplate = detectActiveTemplate(config);
  const formLabel = FORM_TYPE_LABELS[config.leadType] ?? 'Custom Form';

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 bg-muted rounded-lg w-40" />
        <div className="h-64 bg-muted rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Header with active form status ── */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-xl font-semibold tracking-tight">Brokerage Intake Form</h1>
            <p className="text-muted-foreground text-sm">
              Design a standard intake form for your brokerage and push it to all members.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {hasChanges ? (
              <Badge variant="outline" className="text-xs text-amber-600 border-amber-300 bg-amber-50 gap-1.5">
                <AlertCircle size={12} />
                Unsaved changes
              </Badge>
            ) : hasSavedConfig ? (
              <Badge variant="outline" className="text-xs text-emerald-600 border-emerald-300 bg-emerald-50 gap-1.5">
                <CheckCircle2 size={12} />
                Saved
              </Badge>
            ) : null}
            <Button variant="outline" size="sm" onClick={handleReset}>
              <RotateCcw size={14} className="mr-1.5" /> Reset to Default
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving || !hasChanges}>
              {saving ? (
                <><Loader2 size={14} className="mr-1.5 animate-spin" /> Saving...</>
              ) : (
                <><Save size={14} className="mr-1.5" /> Save Form</>
              )}
            </Button>
          </div>
        </div>

        {/* ── Active form status bar ── */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3">
            {/* Current form identity */}
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <Pencil size={16} className="text-muted-foreground flex-shrink-0" />
                <span className="text-sm font-semibold">Editing: {formLabel}</span>
              </div>
              {hasSavedConfig ? (
                <Badge variant="secondary" className="text-[10px]">Custom</Badge>
              ) : (
                <Badge variant="outline" className="text-[10px]">Not configured</Badge>
              )}
            </div>

            {/* Form switcher */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-xs text-muted-foreground mr-1">Switch to:</span>
              <Button
                variant={activeTemplate === 'rental' ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleSwitchTemplate('rental')}
                disabled={activeTemplate === 'rental'}
              >
                <Home size={14} className="mr-1.5" /> Rental Application
              </Button>
              <Button
                variant={activeTemplate === 'buyer' ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleSwitchTemplate('buyer')}
                disabled={activeTemplate === 'buyer'}
              >
                <Users size={14} className="mr-1.5" /> Buyer Inquiry
              </Button>
            </div>
          </div>

          {/* Contextual hint */}
          {!hasSavedConfig && (
            <div className="px-5 py-2.5 border-t border-border bg-blue-50/50 flex items-start gap-2">
              <Info size={14} className="text-blue-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-blue-700">
                No custom brokerage form is configured yet. Customize the fields below and save to create your brokerage standard form.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── Push to members ── */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="space-y-0.5">
            <p className="text-sm font-semibold">Push to All Members</p>
            <p className="text-xs text-muted-foreground">
              Apply this form to {memberCount != null ? (
                <span className="font-medium">{memberCount} member{memberCount === 1 ? '' : 's'}</span>
              ) : (
                'all member realtors'
              )}. Their individual form settings will be overridden.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handlePushToMembers}
            disabled={pushing || hasChanges || !hasSavedConfig}
            className="flex-shrink-0"
          >
            {pushing ? (
              <><Loader2 size={14} className="mr-1.5 animate-spin" /> Pushing...</>
            ) : (
              <><Send size={14} className="mr-1.5" /> Push to Members</>
            )}
          </Button>
        </div>
        {hasChanges && (
          <div className="px-5 py-2 border-t border-border bg-amber-50 dark:bg-amber-950/20 flex items-start gap-2">
            <AlertCircle size={12} className="text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-[11px] text-amber-700 dark:text-amber-400">Save your changes before pushing to members.</p>
          </div>
        )}
        {!hasSavedConfig && !hasChanges && (
          <div className="px-5 py-2 border-t border-border bg-blue-50/50 flex items-start gap-2">
            <Info size={12} className="text-blue-500 flex-shrink-0 mt-0.5" />
            <p className="text-[11px] text-blue-700">Save a custom brokerage form first before pushing to members.</p>
          </div>
        )}
      </div>

      {/* ── Builder / Preview tabs ── */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="builder">
            <Pencil size={14} className="mr-1.5" /> Builder
          </TabsTrigger>
          <TabsTrigger value="preview">
            <Eye size={14} className="mr-1.5" /> Preview
          </TabsTrigger>
        </TabsList>

        <TabsContent value="builder">
          <FormBuilder config={config} onChange={handleConfigChange} />
        </TabsContent>

        <TabsContent value="preview">
          <FormPreview config={config} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
