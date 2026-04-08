'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
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
  CheckCircle2,
  AlertCircle,
  Info,
  Lightbulb,
  Gauge,
  Shuffle,
} from 'lucide-react';
import { toast } from 'sonner';
import { FormBuilder } from '@/components/form-builder';
import { FormPreview } from '@/components/form-builder/form-preview';
import { OptimizationPanel } from '@/components/form-builder/optimization-panel';
import { ScoringPreview } from '@/components/form-builder/scoring-preview';
import { TEMPLATES } from '@/components/form-builder/templates';
import type { IntakeFormConfig } from '@/components/form-builder/types';
import type { TemplateName } from '@/components/form-builder/templates';

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

type FormConfigSource = 'custom' | 'brokerage' | 'legacy';

/** Human-friendly labels for each form type */
const FORM_TYPE_LABELS: Record<string, string> = {
  rental: 'Rental Application',
  buyer: 'Buyer Inquiry',
  general: 'Universal (Rent & Buy)',
};

/** Detect which standard template the config matches, if any */
function detectActiveTemplate(config: IntakeFormConfig): TemplateName | null {
  if (config.leadType === 'general') return 'unified';
  return config.leadType === 'rental'
    ? 'rental'
    : config.leadType === 'buyer'
      ? 'buyer'
      : null;
}

export default function FormFieldsSettingsPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? '';

  const [config, setConfig] = useState<IntakeFormConfig>(deepClone(TEMPLATES.rental.config));
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string>('builder');
  const [hasChanges, setHasChanges] = useState(false);
  const [configSource, setConfigSource] = useState<FormConfigSource>('legacy');
  const [hasSavedConfig, setHasSavedConfig] = useState(false);

  // Track the last-saved config to detect unsaved changes accurately
  const savedConfigRef = useRef<string>('');

  // Load existing config from the API
  useEffect(() => {
    if (!slug) return;
    fetch(`/api/form-config?slug=${encodeURIComponent(slug)}`)
      .then((r) => {
        if (!r.ok) throw new Error('Not found');
        return r.json();
      })
      .then((data: { formConfig: IntakeFormConfig | null; formConfigSource: FormConfigSource }) => {
        const source = data.formConfigSource ?? 'legacy';
        setConfigSource(source);

        if (data.formConfig?.sections) {
          // Saved custom or brokerage config exists -- load it
          setConfig(data.formConfig);
          setHasSavedConfig(true);
          savedConfigRef.current = JSON.stringify(data.formConfig);
        } else {
          // Legacy / no saved config -- show the rental template as the default
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
  }, [slug]);

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
      const res = await fetch('/api/form-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, formConfig: config }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Failed to save form configuration.');
      }
      const result = await res.json().catch(() => ({}));
      setConfigSource(result.formConfigSource ?? 'custom');
      setHasSavedConfig(true);
      setHasChanges(false);
      savedConfigRef.current = JSON.stringify(config);
      toast.success('Form saved successfully.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  }, [slug, config]);

  const handleReset = useCallback(async () => {
    if (
      !confirm(
        'Reset to the standard Chippi rental form? Your custom changes will be removed and applicants will see the default form.',
      )
    )
      return;
    try {
      const res = await fetch('/api/form-config', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug }),
      });
      if (!res.ok) {
        throw new Error('Failed to reset form configuration.');
      }
      const defaultConfig = deepClone(TEMPLATES.rental.config);
      setConfig(defaultConfig);
      setConfigSource('legacy');
      setHasSavedConfig(false);
      setHasChanges(false);
      savedConfigRef.current = JSON.stringify(defaultConfig);
      toast.success('Form reset to the standard Chippi default.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong.');
    }
  }, [slug]);

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
            <h1 className="text-xl font-semibold tracking-tight">Intake Form</h1>
            <p className="text-muted-foreground text-sm">
              Customize the form applicants fill out when they inquire about your listings.
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
              {configSource === 'custom' && hasSavedConfig && (
                <Badge variant="secondary" className="text-[10px]">Custom</Badge>
              )}
              {configSource === 'brokerage' && (
                <Badge variant="secondary" className="text-[10px]">Brokerage Template</Badge>
              )}
              {configSource === 'legacy' && !hasSavedConfig && (
                <Badge variant="outline" className="text-[10px]">Default</Badge>
              )}
            </div>

            {/* Form switcher */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-xs text-muted-foreground mr-1">Switch to:</span>
              <Button
                variant={activeTemplate === 'unified' ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleSwitchTemplate('unified')}
                disabled={activeTemplate === 'unified'}
              >
                <Shuffle size={14} className="mr-1.5" /> Universal
              </Button>
              <Button
                variant={activeTemplate === 'rental' ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleSwitchTemplate('rental')}
                disabled={activeTemplate === 'rental'}
              >
                <Home size={14} className="mr-1.5" /> Rental
              </Button>
              <Button
                variant={activeTemplate === 'buyer' ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleSwitchTemplate('buyer')}
                disabled={activeTemplate === 'buyer'}
              >
                <Users size={14} className="mr-1.5" /> Buyer
              </Button>
            </div>
          </div>

          {/* Contextual hint */}
          {configSource === 'legacy' && !hasSavedConfig && (
            <div className="px-5 py-2.5 border-t border-border bg-blue-50/50 flex items-start gap-2">
              <Info size={14} className="text-blue-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-blue-700">
                You are using the standard Chippi form. Customize the fields below and save to create your own version.
              </p>
            </div>
          )}
          {configSource === 'brokerage' && (
            <div className="px-5 py-2.5 border-t border-border bg-blue-50/50 flex items-start gap-2">
              <Info size={14} className="text-blue-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-blue-700">
                This form was set by your brokerage. You can customize it and save your own version, or reset to go back to the brokerage default.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── Builder / Preview / Optimize / Test Scoring tabs ── */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="builder">
            <Pencil size={14} className="mr-1.5" /> Builder
          </TabsTrigger>
          <TabsTrigger value="preview">
            <Eye size={14} className="mr-1.5" /> Preview
          </TabsTrigger>
          <TabsTrigger value="optimize" title="Get AI-powered suggestions to improve your form based on real applicant data">
            <Lightbulb size={14} className="mr-1.5" /> Suggestions
          </TabsTrigger>
          <TabsTrigger value="test-scoring" title="Try filling out your form as a test applicant to see what lead score they would get">
            <Gauge size={14} className="mr-1.5" /> Score Simulator
          </TabsTrigger>
        </TabsList>

        <TabsContent value="builder">
          <FormBuilder config={config} onChange={handleConfigChange} />
        </TabsContent>

        <TabsContent value="preview">
          <FormPreview config={config} />
        </TabsContent>

        <TabsContent value="optimize">
          <OptimizationPanel slug={slug} />
        </TabsContent>

        <TabsContent value="test-scoring">
          <ScoringPreview config={config} slug={slug} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
