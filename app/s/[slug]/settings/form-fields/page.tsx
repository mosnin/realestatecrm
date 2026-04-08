'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Save, RotateCcw, Eye, Pencil, FileText, Home, Users } from 'lucide-react';
import { toast } from 'sonner';
import { FormBuilder } from '@/components/form-builder';
import { FormPreview } from '@/components/form-builder/form-preview';
import { TEMPLATES } from '@/components/form-builder/templates';
import type { IntakeFormConfig } from '@/components/form-builder/types';
import type { TemplateName } from '@/components/form-builder/templates';

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

export default function FormFieldsSettingsPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? '';

  const [config, setConfig] = useState<IntakeFormConfig>(deepClone(TEMPLATES.rental.config));
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string>('builder');
  const [hasChanges, setHasChanges] = useState(false);

  // Load existing config
  useEffect(() => {
    if (!slug) return;
    fetch(`/api/form-config?slug=${encodeURIComponent(slug)}`)
      .then((r) => {
        if (!r.ok) throw new Error('Not found');
        return r.json();
      })
      .then((data) => {
        if (data && data.sections) {
          setConfig(data as IntakeFormConfig);
        }
      })
      .catch(() => {
        // No existing config, use blank template
      })
      .finally(() => setLoading(false));
  }, [slug]);

  const handleConfigChange = useCallback((newConfig: IntakeFormConfig) => {
    setConfig(newConfig);
    setHasChanges(true);
  }, []);

  const handleTemplateSelect = useCallback((name: TemplateName) => {
    const template = TEMPLATES[name];
    setConfig(deepClone(template.config));
    setHasChanges(true);
    toast.success(`Loaded "${template.label}" template`);
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/form-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, config }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Failed to save form configuration.');
      }
      setHasChanges(false);
      toast.success('Form configuration saved.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  }, [slug, config]);

  const handleReset = useCallback(async () => {
    if (!confirm('Are you sure you want to reset to default? This cannot be undone.')) return;
    try {
      const res = await fetch(`/api/form-config?slug=${encodeURIComponent(slug)}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        throw new Error('Failed to reset form configuration.');
      }
      setConfig(deepClone(TEMPLATES.rental.config));
      setHasChanges(false);
      toast.success('Form configuration reset to default.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong.');
    }
  }, [slug]);

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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Form Builder</h1>
          <p className="text-muted-foreground text-sm">
            Design your custom intake form with drag-and-drop
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hasChanges && (
            <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300">
              Unsaved changes
            </Badge>
          )}
          <Button variant="outline" size="sm" onClick={handleReset}>
            <RotateCcw size={14} className="mr-1.5" /> Reset
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? (
              <><Loader2 size={14} className="mr-1.5 animate-spin" /> Saving...</>
            ) : (
              <><Save size={14} className="mr-1.5" /> Save</>
            )}
          </Button>
        </div>
      </div>

      {/* Template selector */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-3 border-b border-border bg-muted/20">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Start from a template</p>
        </div>
        <div className="px-5 py-3 flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleTemplateSelect('rental')}
          >
            <Home size={14} className="mr-1.5" /> Rental
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleTemplateSelect('buyer')}
          >
            <Users size={14} className="mr-1.5" /> Buyer
          </Button>
        </div>
      </div>

      {/* Builder / Preview tabs */}
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
