'use client';

/**
 * Broker announcements — Chippi vocabulary.
 *
 * Divide-y row list (title + posted-by + timestamp) with tap-to-expand
 * for the body. PRIMARY_PILL on the post action. AlertDialog (not
 * window.confirm) on delete. Canonical dashed-card empty state.
 */

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Plus, Trash2, X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  BODY,
  BODY_MUTED,
  META,
  PRIMARY_PILL,
  GHOST_PILL,
} from '@/lib/typography';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

type Announcement = {
  id: string;
  title: string;
  body: string;
  authorName: string;
  createdAt: string;
  updatedAt: string;
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(iso);
}

export default function AnnouncementsClient() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<Announcement | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Form state
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');

  useEffect(() => {
    loadAnnouncements();
  }, []);

  async function loadAnnouncements() {
    try {
      const res = await fetch('/api/broker/announcements');
      if (res.ok) {
        const data = await res.json();
        setAnnouncements(data);
      }
    } catch {
      toast.error('Couldn’t load announcements.');
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    setTitle('');
    setBody('');
    setShowForm(false);
  }

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handlePost() {
    if (!title.trim() || !body.trim()) {
      toast.error('Title and body are required.');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/broker/announcements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), body: body.trim() }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Couldn’t post the announcement.');
      }

      const newAnn = await res.json();
      setAnnouncements((prev) => [newAnn, ...prev]);
      toast.success('Announcement posted.');
      resetForm();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Couldn’t post.');
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/broker/announcements?id=${deleteTarget.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('delete failed');
      setAnnouncements((prev) => prev.filter((a) => a.id !== deleteTarget.id));
      toast.success('Announcement deleted.');
      setDeleteTarget(null);
    } catch {
      toast.error('Couldn’t delete that one.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header action row */}
      <div className="flex items-center justify-end">
        {!showForm && (
          <button
            type="button"
            onClick={() => {
              resetForm();
              setShowForm(true);
            }}
            className={cn(PRIMARY_PILL)}
          >
            <Plus size={14} />
            Post announcement
          </button>
        )}
      </div>

      {/* Post form */}
      {showForm && (
        <section className="rounded-xl border border-border/70 bg-card px-5 py-5 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">New announcement</p>
            <button
              onClick={resetForm}
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </div>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <label
                htmlFor="ann-title"
                className="text-sm font-medium text-foreground"
              >
                Title
              </label>
              <input
                id="ann-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="One sentence the team can scan."
                className={cn(
                  'w-full h-9 rounded-md border border-input bg-transparent px-3',
                  'text-base md:text-sm placeholder:text-muted-foreground/70',
                  'focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none focus-visible:ring-offset-1 focus-visible:ring-offset-background',
                  'transition-colors duration-150',
                )}
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="ann-body"
                className="text-sm font-medium text-foreground"
              >
                Details
              </label>
              <textarea
                id="ann-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="What you’d say if you walked into the room."
                rows={5}
                className={cn(
                  'w-full rounded-md border border-input bg-transparent px-3 py-2',
                  'text-base md:text-sm placeholder:text-muted-foreground/70 resize-none',
                  'focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none focus-visible:ring-offset-1 focus-visible:ring-offset-background',
                  'transition-colors duration-150',
                )}
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={resetForm}
                className={cn(GHOST_PILL)}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handlePost}
                disabled={saving}
                className={cn(PRIMARY_PILL, 'disabled:opacity-50')}
              >
                {saving && <Loader2 size={13} className="animate-spin" />}
                {saving ? 'Posting…' : 'Post'}
              </button>
            </div>
          </div>
        </section>
      )}

      {/* List */}
      {loading ? (
        <p className={cn(BODY_MUTED)}>Pulling announcements.</p>
      ) : announcements.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 px-5 py-10 text-center">
          <p className={cn(BODY)}>Quiet — nothing to broadcast yet.</p>
          <p className={cn(BODY_MUTED, 'mt-1')}>
            Post once when the whole team needs to hear it.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border/60 border-y border-border/60">
          {announcements.map((ann) => {
            const isOpen = expanded.has(ann.id);
            return (
              <li key={ann.id} className="py-3">
                <div className="flex items-start gap-3">
                  <button
                    type="button"
                    onClick={() => toggleExpanded(ann.id)}
                    className="flex-1 min-w-0 text-left"
                  >
                    <p className="text-sm font-medium text-foreground truncate">
                      {ann.title}
                    </p>
                    <p className={cn(META, 'mt-0.5')}>
                      <span className="text-muted-foreground">{ann.authorName}</span>
                      <span aria-hidden className="mx-1 text-muted-foreground/40">
                        ·
                      </span>
                      <span>{relativeTime(ann.createdAt)}</span>
                    </p>
                    {isOpen && (
                      <p className="text-sm text-foreground/85 whitespace-pre-wrap leading-relaxed mt-2">
                        {ann.body}
                      </p>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(ann)}
                    className="p-1.5 rounded-md text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground transition-colors flex-shrink-0"
                    title="Delete"
                    aria-label={`Delete ${ann.title}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => (!o && !deleting ? setDeleteTarget(null) : null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this announcement?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? `“${deleteTarget.title}” will be removed for the whole team.`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deleting}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
