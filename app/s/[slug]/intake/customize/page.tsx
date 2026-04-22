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
  Key,
  CheckCircle2,
  AlertCircle,
  Info,
  Lightbulb,
  Gauge,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import { FormBuilder } from '@/components/form-builder';
import { FormPreview } from '@/components/form-builder/form-preview';
import { OptimizationPanel } from '@/components/form-builder/optimization-panel';
import { ScoringPreview } from '@/components/form-builder/scoring-preview';
import { ScoringTab } from '@/components/form-builder/scoring-tab';
import { TEMPLATES } from '@/components/form-builder/templates';
import type { IntakeFormConfig } from '@/components/form-builder/types';
import type { ScoringModel } from '@/lib/scoring/scoring-model-types';

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

type FormConfigSource = 'custom' | 'brokerage' | 'legacy';
type LeadType = 'rental' | 'buyer';

export default function IntakeCustomizePage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? '';

  // Primary tab: which form are we editing
  const [activeLeadType, setActiveLeadType] = useState<LeadType>('rental');

  // Per-form state
  const [rentalConfig, setRentalConfig] = useState<IntakeFormConfig>(deepClone(TEMPLATES.rental.config));
  const [buyerConfig, setBuyerConfig] = useState<IntakeFormConfig>(deepClone(TEMPLATES.buyer.config));
  const [rentalHasChanges, setRentalHasChanges] = useState(false);
  const [buyerHasChanges, setBuyerHasChanges] = useState(false);
  const [rentalHasSavedConfig, setRentalHasSavedConfig] = useState(false);
  const [buyerHasSavedConfig, setBuyerHasSavedConfig] = useState(false);
  const rentalSavedRef = useRef<string>('');
  const buyerSavedRef = useRef<string>('');

  const [saving, setSaving] = useState(false);
  const [savingPhase, setSavingPhase] = useState<'form' | 'scoring' | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeSubTab, setActiveSubTab] = useState<string>('builder');
  const [configSource, setConfigSource] = useState<FormConfigSource>('legacy');

  // Scoring model state (separate from form config)
  const [rentalScoringModel, setRentalScoringModel] = useState<ScoringModel | null>(null);
  const [buyerScoringModel, setBuyerScoringModel] = useState<ScoringModel | null>(null);

  // Load existing configs from the API
  useEffect(() => {
    if (!slug) return;
    fetch(`/api/form-config?slug=${encodeURIComponent(slug)}`)
      .then((r) => {
        if (!r.ok) throw new Error('Not found');
        return r.json();
      })
      .then((data: {
        rentalFormConfig: IntakeFormConfig | null;
        buyerFormConfig: IntakeFormConfig | null;
        formConfigSource: FormConfigSource;
        rentalScoringModel: ScoringModel | null;
        buyerScoringModel: ScoringModel | null;
      }) => {
        const source = data.formConfigSource ?? 'legacy';
        setConfigSource(source);

        // Scoring models
        if (data.rentalScoringModel) setRentalScoringModel(data.rentalScoringModel);
        if (data.buyerScoringModel) setBuyerScoringModel(data.buyerScoringModel);

        // Rental config
        if (data.rentalFormConfig?.sections) {
          setRentalConfig(data.rentalFormConfig);
          setRentalHasSavedConfig(true);
          rentalSavedRef.current = JSON.stringify(data.rentalFormConfig);
        } else {
          const defaultConfig = deepClone(TEMPLATES.rental.config);
          setRentalConfig(defaultConfig);
          setRentalHasSavedConfig(false);
          rentalSavedRef.current = JSON.stringify(defaultConfig);
        }

        // Buyer config
        if (data.buyerFormConfig?.sections) {
          setBuyerConfig(data.buyerFormConfig);
          setBuyerHasSavedConfig(true);
          buyerSavedRef.current = JSON.stringify(data.buyerFormConfig);
        } else {
          const defaultConfig = deepClone(TEMPLATES.buyer.config);
          setBuyerConfig(defaultConfig);
          setBuyerHasSavedConfig(false);
          buyerSavedRef.current = JSON.stringify(defaultConfig);
        }
      })
      .catch(() => {
        const defaultRental = deepClone(TEMPLATES.rental.config);
        const defaultBuyer = deepClone(TEMPLATES.buyer.config);
        setRentalConfig(defaultRental);
        setBuyerConfig(defaultBuyer);
        rentalSavedRef.current = JSON.stringify(defaultRental);
        buyerSavedRef.current = JSON.stringify(defaultBuyer);
      })
      .finally(() => setLoading(false));
  }, [slug]);

  // Active config accessor
  const config = activeLeadType === 'rental' ? rentalConfig : buyerConfig;
  const hasChanges = activeLeadType === 'rental' ? rentalHasChanges : buyerHasChanges;
  const hasSavedConfig = activeLeadType === 'rental' ? rentalHasSavedConfig : buyerHasSavedConfig;
  const activeScoringModel = activeLeadType === 'rental' ? rentalScoringModel : buyerScoringModel;

  const handleScoringModelChange = useCallback((model: ScoringModel) => {
    if (activeLeadType === 'rental') {
      setRentalScoringModel(model);
    } else {
      setBuyerScoringModel(model);
    }
  }, [activeLeadType]);

  const handleConfigChange = useCallback((newConfig: IntakeFormConfig) => {
    if (activeLeadType === 'rental') {
      setRentalConfig(newConfig);
      setRentalHasChanges(JSON.stringify(newConfig) !== rentalSavedRef.current);
    } else {
      setBuyerConfig(newConfig);
      setBuyerHasChanges(JSON.stringify(newConfig) !== buyerSavedRef.current);
    }
  }, [activeLeadType]);

  const rentalConfigRef = useRef(rentalConfig);
  rentalConfigRef.current = rentalConfig;
  const buyerConfigRef = useRef(buyerConfig);
  buyerConfigRef.current = buyerConfig;

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSavingPhase('form');
    const currentConfig = activeLeadType === 'rental' ? rentalConfigRef.current : buyerConfigRef.current;
    try {
      // Phase 1: Save the form config
      const res = await fetch('/api/form-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, leadType: activeLeadType, formConfig: currentConfig }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Failed to save form configuration.');
      }
      const result = await res.json().catch(() => ({}));
      setConfigSource(result.formConfigSource ?? 'custom');

      if (activeLeadType === 'rental') {
        setRentalHasSavedConfig(true);
        setRentalHasChanges(false);
        rentalSavedRef.current = JSON.stringify(currentConfig);
      } else {
        setBuyerHasSavedConfig(true);
        setBuyerHasChanges(false);
        buyerSavedRef.current = JSON.stringify(currentConfig);
      }

      // Phase 2: Generate scoring model in background
      setSavingPhase('scoring');
      try {
        const scoringRes = await fetch('/api/form-config/generate-scoring', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            slug,
            leadType: activeLeadType,
            formConfig: currentConfig,
          }),
        });
        if (scoringRes.ok) {
          const { scoringModel: newModel } = await scoringRes.json();
          if (activeLeadType === 'rental') {
            setRentalScoringModel(newModel);
          } else {
            setBuyerScoringModel(newModel);
          }
        }
      } catch {
        // Scoring generation is non-blocking -- form save already succeeded
        console.warn('[intake-customize] Scoring model generation failed (non-blocking)');
      }

      toast.success(`${activeLeadType === 'rental' ? 'Rental' : 'Buyer'} form saved successfully.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setSaving(false);
      setSavingPhase(null);
    }
  }, [slug, activeLeadType]);

  const handleReset = useCallback(async () => {
    const label = activeLeadType === 'rental' ? 'rental' : 'buyer';
    if (
      !confirm(
        `Reset the ${label} form to the standard Chippi default? Your custom changes will be removed.`,
      )
    )
      return;
    try {
      const res = await fetch('/api/form-config', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, leadType: activeLeadType }),
      });
      if (!res.ok) {
        throw new Error('Failed to reset form configuration.');
      }
      const templateKey = activeLeadType === 'rental' ? 'rental' : 'buyer';
      const defaultConfig = deepClone(TEMPLATES[templateKey].config);
      if (activeLeadType === 'rental') {
        setRentalConfig(defaultConfig);
        setRentalHasSavedConfig(false);
        setRentalHasChanges(false);
        rentalSavedRef.current = JSON.stringify(defaultConfig);
      } else {
        setBuyerConfig(defaultConfig);
        setBuyerHasSavedConfig(false);
        setBuyerHasChanges(false);
        buyerSavedRef.current = JSON.stringify(defaultConfig);
      }
      toast.success(`${activeLeadType === 'rental' ? 'Rental' : 'Buyer'} form reset to the standard Chippi default.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong.');
    }
  }, [slug, activeLeadType]);

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
      {/* Header */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-xl font-semibold tracking-tight">Customize Intake Form</h1>
            <p className="text-muted-foreground text-sm">
              Customize the forms applicants see. Your intake link shows a &quot;Getting Started&quot; step that routes to the correct form.
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
                <><Loader2 size={14} className="mr-1.5 animate-spin" /> {savingPhase === 'scoring' ? 'Generating scoring model...' : 'Saving form...'}</>
              ) : (
                <><Save size={14} className="mr-1.5" /> Save Form</>
              )}
            </Button>
          </div>
        </div>

        {/* Primary tabs: Rental Form / Buyer Form */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setActiveLeadType('rental')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border-2 text-sm font-medium transition-all ${
              activeLeadType === 'rental'
                ? 'border-orange-400 bg-orange-50 text-orange-700 shadow-sm'
                : 'border-border text-muted-foreground hover:border-muted-foreground/30'
            }`}
          >
            <Home size={16} />
            Rental Form
            {rentalHasChanges && (
              <span className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0" />
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveLeadType('buyer')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border-2 text-sm font-medium transition-all ${
              activeLeadType === 'buyer'
                ? 'border-blue-400 bg-blue-50 text-blue-700 shadow-sm'
                : 'border-border text-muted-foreground hover:border-muted-foreground/30'
            }`}
          >
            <Key size={16} />
            Buyer Form
            {buyerHasChanges && (
              <span className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0" />
            )}
          </button>
        </div>

        {/* Active form status bar */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <Pencil size={16} className="text-muted-foreground flex-shrink-0" />
                <span className="text-sm font-semibold">
                  Editing: {activeLeadType === 'rental' ? 'Rental Application' : 'Buyer Inquiry'}
                </span>
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
          </div>

          {configSource === 'legacy' && !hasSavedConfig && (
            <div className="px-5 py-2.5 border-t border-border bg-blue-50/50 flex items-start gap-2">
              <Info size={14} className="text-blue-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-blue-700">
                You are using the standard Chippi {activeLeadType === 'rental' ? 'rental' : 'buyer'} form. Customize the fields below and save to create your own version.
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

      {/* Builder / Preview / What-makes-a-good-lead / Try-it-out / Improve sub-tabs */}
      <Tabs value={activeSubTab} onValueChange={setActiveSubTab}>
        <TabsList>
          <TabsTrigger value="builder">
            <Pencil size={14} className="mr-1.5" /> Questions
          </TabsTrigger>
          <TabsTrigger value="preview">
            <Eye size={14} className="mr-1.5" /> Preview
          </TabsTrigger>
          <TabsTrigger value="scoring" title="Tell the assistant what makes a good lead for you — which answers matter and how much.">
            <Sparkles size={14} className="mr-1.5" /> What makes a good lead
          </TabsTrigger>
          <TabsTrigger value="test-scoring" title="See how a sample applicant would rank given your answers.">
            <Gauge size={14} className="mr-1.5" /> Try it with a sample
          </TabsTrigger>
          <TabsTrigger value="optimize" title="Suggestions for how to ask better questions based on real applicants.">
            <Lightbulb size={14} className="mr-1.5" /> Improve
          </TabsTrigger>
        </TabsList>

        <TabsContent value="builder">
          <FormBuilder config={config} onChange={handleConfigChange} />
        </TabsContent>

        <TabsContent value="preview">
          <FormPreview config={config} />
        </TabsContent>

        <TabsContent value="scoring">
          <ScoringTab
            config={config}
            slug={slug}
            leadType={activeLeadType}
            scoringModel={activeScoringModel}
            onScoringModelChange={handleScoringModelChange}
            onSave={async (model) => {
              const res = await fetch('/api/form-config/save-scoring', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ slug, leadType: activeLeadType, scoringModel: model }),
              });
              if (!res.ok) {
                const d = await res.json().catch(() => ({}));
                throw new Error(d.error || 'Failed to save scoring model');
              }
            }}
          />
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
