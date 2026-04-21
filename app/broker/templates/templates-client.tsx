'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Copy, FileText, X, Loader2 } from 'lucide-react';

type Template = {
  id: string;
  name: string;
  category: string;
  body: string;
  createdAt: string;
  updatedAt: string;
};

const CATEGORIES = [
  { value: 'follow-up', label: 'Follow-up' },
  { value: 'intro', label: 'Intro' },
  { value: 'closing', label: 'Closing' },
  { value: 'tour-invite', label: 'Tour Invite' },
] as const;

const categoryStyles: Record<string, string> = {
  'follow-up': 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400',
  intro: 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400',
  closing: 'bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-400',
  'tour-invite': 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400',
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function TemplatesClient() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Template | null>(null);
  const [saving, setSaving] = useState(false);
  const [filterCategory, setFilterCategory] = useState<string>('all');

  // Form state
  const [name, setName] = useState('');
  const [category, setCategory] = useState<string>('follow-up');
  const [body, setBody] = useState('');

  useEffect(() => {
    loadTemplates();
  }, []);

  async function loadTemplates() {
    try {
      const res = await fetch('/api/broker/templates');
      if (res.ok) {
        const data = await res.json();
        setTemplates(data);
      }
    } catch {
      toast.error('Failed to load templates');
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    setName('');
    setCategory('follow-up');
    setBody('');
    setEditing(null);
    setShowForm(false);
  }

  function startEdit(t: Template) {
    setName(t.name);
    setCategory(t.category);
    setBody(t.body);
    setEditing(t);
    setShowForm(true);
  }

  async function handleSave() {
    if (!name.trim() || !body.trim()) {
      toast.error('Name and body are required');
      return;
    }

    setSaving(true);
    try {
      const payload = { name: name.trim(), category, body: body.trim(), id: editing?.id };
      const res = await fetch('/api/broker/templates', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to save template');
      }

      const saved = await res.json();

      if (editing) {
        setTemplates((prev) => prev.map((t) => (t.id === saved.id ? saved : t)));
      } else {
        setTemplates((prev) => [saved, ...prev]);
      }

      toast.success(editing ? 'Template updated' : 'Template created');
      resetForm();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this template?')) return;

    try {
      const res = await fetch(`/api/broker/templates?id=${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
      setTemplates((prev) => prev.filter((t) => t.id !== id));
      toast.success('Template deleted');
    } catch {
      toast.error('Failed to delete template');
    }
  }

  function handleCopy(t: Template) {
    navigator.clipboard.writeText(t.body);
    toast.success('Template copied to clipboard');
  }

  const filtered = filterCategory === 'all'
    ? templates
    : templates.filter((t) => t.category === filterCategory);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Template Library</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Shared follow-up templates for your team
          </p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setShowForm(true);
          }}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus size={15} />
          New Template
        </button>
      </div>

      {/* Create/Edit form */}
      {showForm && (
        <Card>
          <CardContent className="px-5 py-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">
                {editing ? 'Edit Template' : 'New Template'}
              </h2>
              <button onClick={resetForm} className="text-muted-foreground hover:text-foreground">
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Initial follow-up"
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">
                  Body
                  <span className="ml-2 text-[10px] text-muted-foreground/60 font-normal">
                    Use {'{{name}}'}, {'{{property}}'}, {'{{budget}}'} as placeholders
                  </span>
                </label>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder={`Hi {{name}},\n\nThank you for your interest in {{property}}. I'd love to schedule a tour at your convenience.\n\nBest regards`}
                  rows={6}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="flex justify-end gap-2">
                <button
                  onClick={resetForm}
                  className="px-3 py-1.5 rounded-md text-sm text-muted-foreground hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {saving && <Loader2 size={13} className="animate-spin" />}
                  {editing ? 'Update' : 'Create'}
                </button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Category filter */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setFilterCategory('all')}
          className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
            filterCategory === 'all'
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground hover:bg-muted/80'
          }`}
        >
          All ({templates.length})
        </button>
        {CATEGORIES.map((c) => {
          const count = templates.filter((t) => t.category === c.value).length;
          return (
            <button
              key={c.value}
              onClick={() => setFilterCategory(c.value)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                filterCategory === c.value
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {c.label} ({count})
            </button>
          );
        })}
      </div>

      {/* Templates list */}
      {loading ? (
        <Card>
          <CardContent className="px-5 py-10 text-center">
            <Loader2 size={20} className="animate-spin mx-auto text-muted-foreground" />
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="px-5 py-10 text-center space-y-2">
            <FileText size={24} className="mx-auto text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              {templates.length === 0 ? 'No templates yet. Create your first one!' : 'No templates in this category.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {filtered.map((t) => (
            <Card key={t.id}>
              <CardContent className="px-5 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold truncate">{t.name}</p>
                      <Badge
                        variant="secondary"
                        className={categoryStyles[t.category] ?? 'bg-muted text-muted-foreground'}
                      >
                        {CATEGORIES.find((c) => c.value === t.category)?.label ?? t.category}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-3 whitespace-pre-wrap">
                      {t.body}
                    </p>
                    <p className="text-[10px] text-muted-foreground/60">
                      Updated {formatDate(t.updatedAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => handleCopy(t)}
                      className="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                      title="Copy to clipboard"
                    >
                      <Copy size={14} />
                    </button>
                    <button
                      onClick={() => startEdit(t)}
                      className="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                      title="Edit"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => handleDelete(t.id)}
                      className="p-1.5 rounded-md text-muted-foreground hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 transition-colors"
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
