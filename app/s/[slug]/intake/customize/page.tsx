'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { FormBuilder } from '@/components/form-builder';
import { FormPreview } from '@/components/form-builder/form-preview';
import { TEMPLATES } from '@/components/form-builder/templates';
import type { IntakeFormConfig } from '@/components/form-builder/types';
import {
  H1,
  TITLE_FONT,
  BODY_MUTED,
  PRIMARY_PILL,
  QUIET_LINK,
  SECTION_LABEL,
} from '@/lib/typography';
import {
  SupportingOrientation,
  SupportingPage,
  SupportingWorkArea,
} from '../../_components/supporting-page';

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

type FormConfigSource = 'custom' | 'brokerage' | 'legacy';
type LeadType = 'rental' | 'buyer';

const SUB_TABS: { value: string; label: string }[] = [
  { value: 'builder', label: 'Questions' },
  { value: 'preview', label: 'Preview' },
];

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
  const [loading, setLoading] = useState(true);
  const [activeSubTab, setActiveSubTab] = useState<string>('builder');
  const [configSource, setConfigSource] = useState<FormConfigSource>('legacy');
  // Bumps after a successful save so the preview iframe remounts and reloads.
  const [previewVersion, setPreviewVersion] = useState(0);
  // Live preview iframe ref — used to postMessage draft updates so changes
  // appear on the realtor's keystroke (CSS-driven properties) instead of
  // waiting for Save.
  const iframeRef = useRef<HTMLIFrameElement>(null);

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
      }) => {
        const source = data.formConfigSource ?? 'legacy';
        setConfigSource(source);

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

  // ── Live preview bridge ────────────────────────────────────────────────────
  // Post the draft customization to the iframe on every edit so CSS-driven
  // properties (accent, dark mode, font) update without a full reload.
  // Debounced 250ms to avoid spamming on every keystroke. Save still drives
  // the full re-mount via `previewVersion` for semantic edits (copy, etc.).
  useEffect(() => {
    if (loading) return;
    const t = setTimeout(() => {
      const target = iframeRef.current?.contentWindow;
      if (!target) return;
      target.postMessage(
        { type: 'chippi:preview-update', customization: config },
        window.location.origin,
      );
    }, 250);
    return () => clearTimeout(t);
  }, [config, loading]);

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

      // Refresh the live preview iframe to reflect the saved changes.
      setPreviewVersion((v) => v + 1);

      toast.success(`${activeLeadType === 'rental' ? 'Rental' : 'Buyer'} form saved.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "That tripped me up. Try again.");
    } finally {
      setSaving(false);
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
      toast.success(`${activeLeadType === 'rental' ? 'Rental' : 'Buyer'} form reset to default.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "That tripped me up. Try again.");
    }
  }, [slug, activeLeadType]);

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 bg-foreground/[0.04] rounded-lg w-40" />
        <div className="h-64 bg-foreground/[0.04] rounded-lg" />
      </div>
    );
  }

  const formLabel = activeLeadType === 'rental' ? 'rental form' : 'buyer form';
  const isCustom = configSource === 'custom' && hasSavedConfig;
  const isBrokerage = configSource === 'brokerage';

  const subtitleBase = isCustom
    ? `Your ${formLabel}.`
    : isBrokerage
      ? `Brokerage ${formLabel}.`
      : `Default ${formLabel}.`;
  const subtitle = hasChanges ? `${subtitleBase} Unsaved changes.` : subtitleBase;

  return (
    // The form-builder itself has its own three-column layout (palette /
    // sections / property inspector) — stacking the live-preview beside
    // it at lg/xl squeezed the middle column to nothing on typical
    // viewports. Side-by-side preview is reserved for 2xl+ (1536px),
    // where everything fits. On smaller screens the preview drops below
    // the builder; the "Open in new tab" link at the top of the preview
    // is the escape hatch when the realtor wants a dedicated window.
    <SupportingPage family="intake" width="full">
      <SupportingOrientation
        family="intake"
        eyebrow={`Intake / ${activeLeadType === 'rental' ? 'Rental' : 'Buyer'} form`}
        title="Shape the qualification conversation"
        summary={subtitle}
        nextAction={hasChanges ? 'Review the live preview, then save the changes before leaving.' : 'Inspect the first question a new lead sees and remove anything that does not improve qualification.'}
        action={
          <>
            <button
              type="button"
              onClick={handleReset}
              className={cn(QUIET_LINK, 'px-3 h-10 inline-flex items-center')}
            >
              Reset to default
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !hasChanges}
              className={cn(PRIMARY_PILL, 'disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100')}
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </>
        }
      />
    <SupportingWorkArea className="grid grid-cols-1 gap-8 2xl:grid-cols-[minmax(0,1fr)_480px]">
      {/* Left column — scrolls with the page */}
      <div className="min-w-0 space-y-6">
        {/*
          Tab group — primary (form picker) and secondary (sub-tabs) rows sit
          flush against each other so they read as one stacked control.
        */}
        <div>
          {/* Form picker — primary underline tabs */}
          <div className="flex items-center gap-1 border-b border-border/70">
            {(['rental', 'buyer'] as const).map((type) => {
              const isActive = activeLeadType === type;
              const dirty = type === 'rental' ? rentalHasChanges : buyerHasChanges;
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => setActiveLeadType(type)}
                  className={cn(
                    'inline-flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors duration-150',
                    isActive
                      ? 'border-foreground text-foreground'
                      : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border',
                  )}
                >
                  {type === 'rental' ? 'Rental Form' : 'Buyer Form'}
                  {dirty && (
                    <span
                      aria-label="unsaved changes"
                      className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 flex-shrink-0"
                    />
                  )}
                </button>
              );
            })}
          </div>

          {/* Sub-tabs — secondary underline row */}
          <div className="flex items-center gap-1 border-b border-border/70 overflow-x-auto">
            {SUB_TABS.map((tab) => {
              const isActive = activeSubTab === tab.value;
              return (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => setActiveSubTab(tab.value)}
                  className={cn(
                    'whitespace-nowrap px-3 py-2 text-[13px] font-medium border-b-2 transition-colors duration-150',
                    isActive
                      ? 'border-foreground text-foreground'
                      : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border',
                  )}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Sub-tab content */}
        <div className="min-w-0">
          {activeSubTab === 'builder' && (
            <FormBuilder config={config} onChange={handleConfigChange} />
          )}
          {activeSubTab === 'preview' && <FormPreview config={config} />}
        </div>
      </div>

      {/* Live preview — sticky on wide viewports. Mobile users keep the Preview sub-tab. */}
      <aside className="hidden lg:block">
        <div className="sticky top-6 h-[calc(100vh-3rem)] flex flex-col rounded-xl border border-border/70 bg-background overflow-hidden">
          <div className="px-4 py-2 border-b border-border/70 flex items-center justify-between flex-shrink-0">
            <p className={SECTION_LABEL}>Live preview</p>
            <a
              href={`/apply/${slug}`}
              target="_blank"
              rel="noreferrer"
              className={cn(QUIET_LINK, 'text-xs')}
            >
              Open in new tab ↗
            </a>
          </div>
          <iframe
            key={previewVersion}
            ref={iframeRef}
            src={`/apply/${slug}?preview=1`}
            className="flex-1 w-full bg-background"
            title="Form preview"
          />
        </div>
      </aside>
    </SupportingWorkArea>
    </SupportingPage>
  );
}
