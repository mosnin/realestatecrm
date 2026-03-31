'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import {
  Plus,
  FileText,
  Trash2,
  Check,
  Loader2,
  StickyNote,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────────

interface NoteListItem {
  id: string;
  title: string;
  icon: string | null;
  sortOrder: number;
  updatedAt: string;
}

interface Contact {
  id: string;
  name: string;
  email: string;
  type: string;
}

interface Deal {
  id: string;
  title: string;
  address: string;
}

interface NoteDetail {
  id: string;
  title: string;
  icon: string | null;
  content: string;
  sortOrder: number;
  updatedAt: string;
}

interface MentionOption {
  id: string;
  label: string;
  kind: 'contact' | 'deal';
  sub: string;
}

interface NotesClientProps {
  slug: string;
  initialNotes: NoteListItem[];
  contacts: Contact[];
  deals: Deal[];
}

// ── Component ──────────────────────────────────────────────────────────────────

export function NotesClient({ slug, initialNotes, contacts, deals }: NotesClientProps) {
  const [notes, setNotes] = useState<NoteListItem[]>(initialNotes);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [noteDetail, setNoteDetail] = useState<NoteDetail | null>(null);
  const [loadingNote, setLoadingNote] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [creating, setCreating] = useState(false);

  // Editor state
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');

  // Mention state
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mentionPos, setMentionPos] = useState<{ top: number; left: number } | null>(null);
  const [mentionStart, setMentionStart] = useState<number | null>(null);

  const contentRef = useRef<HTMLTextAreaElement>(null);
  const saveTimeout = useRef<NodeJS.Timeout | null>(null);
  const mentionListRef = useRef<HTMLDivElement>(null);

  // Build mention options
  const allMentions: MentionOption[] = useMemo(() => {
    const c = contacts.map((ct) => ({
      id: ct.id,
      label: ct.name,
      kind: 'contact' as const,
      sub: ct.email || ct.type,
    }));
    const d = deals.map((dl) => ({
      id: dl.id,
      label: dl.title,
      kind: 'deal' as const,
      sub: dl.address ?? '',
    }));
    return [...c, ...d];
  }, [contacts, deals]);

  const filteredMentions = useMemo(() => {
    if (!mentionQuery) return allMentions.slice(0, 8);
    const q = mentionQuery.toLowerCase();
    return allMentions.filter((m) => m.label.toLowerCase().includes(q)).slice(0, 8);
  }, [allMentions, mentionQuery]);

  // ── Load a note ────────────────────────────────────────────────────────────

  const loadNote = useCallback(
    async (id: string) => {
      if (id === activeId && noteDetail) return;
      setLoadingNote(true);
      setActiveId(id);
      setSaveStatus('idle');
      try {
        const res = await fetch(`/api/notes/${id}`);
        if (!res.ok) throw new Error('Failed to load');
        const data: NoteDetail = await res.json();
        setNoteDetail(data);
        setTitle(data.title ?? '');
        setContent(data.content ?? '');
      } catch {
        setNoteDetail(null);
      } finally {
        setLoadingNote(false);
      }
    },
    [activeId, noteDetail],
  );

  // Auto-select first note on mount
  useEffect(() => {
    if (notes.length > 0 && !activeId) {
      loadNote(notes[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Auto-save ──────────────────────────────────────────────────────────────

  const autoSave = useCallback(
    (noteId: string, updates: { title?: string; content?: string }) => {
      if (saveTimeout.current) clearTimeout(saveTimeout.current);
      setSaveStatus('saving');
      saveTimeout.current = setTimeout(async () => {
        try {
          const res = await fetch(`/api/notes/${noteId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updates),
          });
          if (res.ok) {
            const updated = await res.json();
            setSaveStatus('saved');
            // Update sidebar title
            setNotes((prev) =>
              prev.map((n) =>
                n.id === noteId ? { ...n, title: updated.title, updatedAt: updated.updatedAt } : n,
              ),
            );
          }
        } catch {
          setSaveStatus('idle');
        }
      }, 500);
    },
    [],
  );

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleTitleChange = (val: string) => {
    setTitle(val);
    if (activeId) autoSave(activeId, { title: val, content });
  };

  const handleContentChange = (val: string) => {
    setContent(val);
    if (activeId) autoSave(activeId, { title, content: val });
  };

  const createNote = async () => {
    setCreating(true);
    try {
      const res = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, title: 'Untitled' }),
      });
      if (res.ok) {
        const note = await res.json();
        const item: NoteListItem = {
          id: note.id,
          title: note.title,
          icon: note.icon,
          sortOrder: note.sortOrder,
          updatedAt: note.updatedAt,
        };
        setNotes((prev) => [...prev, item]);
        loadNote(note.id);
      }
    } finally {
      setCreating(false);
    }
  };

  const deleteNote = async (id: string) => {
    try {
      await fetch(`/api/notes/${id}`, { method: 'DELETE' });
      setNotes((prev) => prev.filter((n) => n.id !== id));
      if (activeId === id) {
        setActiveId(null);
        setNoteDetail(null);
        setTitle('');
        setContent('');
      }
    } catch {
      // ignore
    }
  };

  // ── Mention handling in textarea ───────────────────────────────────────────

  const handleContentKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionOpen) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex((i) => Math.min(i + 1, filteredMentions.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        if (filteredMentions[mentionIndex]) {
          insertMention(filteredMentions[mentionIndex]);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        closeMention();
      }
    }
  };

  const handleContentInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    handleContentChange(val);

    const textarea = contentRef.current;
    if (!textarea) return;
    const cursorPos = textarea.selectionStart;

    // Find @ that starts the mention
    const textBefore = val.slice(0, cursorPos);
    const atIdx = textBefore.lastIndexOf('@');

    if (atIdx >= 0) {
      const charBeforeAt = atIdx > 0 ? textBefore[atIdx - 1] : ' ';
      const query = textBefore.slice(atIdx + 1);
      // Only trigger if @ is at start or preceded by whitespace, and query has no spaces
      if ((charBeforeAt === ' ' || charBeforeAt === '\n' || atIdx === 0) && !/\s/.test(query)) {
        setMentionOpen(true);
        setMentionQuery(query);
        setMentionIndex(0);
        setMentionStart(atIdx);

        // Position the dropdown near the cursor (approximate)
        const lines = textBefore.split('\n');
        const lineNum = lines.length - 1;
        const charWidth = 8;
        const lineHeight = 24;
        setMentionPos({
          top: (lineNum + 1) * lineHeight + 4,
          left: Math.min(lines[lineNum].length * charWidth, 400),
        });
        return;
      }
    }

    closeMention();
  };

  const insertMention = (mention: MentionOption) => {
    if (mentionStart === null) return;
    const textarea = contentRef.current;
    if (!textarea) return;

    const before = content.slice(0, mentionStart);
    const after = content.slice(textarea.selectionStart);
    const mentionText = `[@${mention.label}](${mention.kind}:${mention.id})`;
    const newContent = before + mentionText + ' ' + after;

    setContent(newContent);
    closeMention();
    if (activeId) autoSave(activeId, { title, content: newContent });

    // Restore cursor
    requestAnimationFrame(() => {
      if (contentRef.current) {
        const pos = before.length + mentionText.length + 1;
        contentRef.current.focus();
        contentRef.current.setSelectionRange(pos, pos);
      }
    });
  };

  const closeMention = () => {
    setMentionOpen(false);
    setMentionQuery('');
    setMentionIndex(0);
    setMentionStart(null);
    setMentionPos(null);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  const renderContent = () => {
    if (!content) return null;
    // Parse mentions to render styled pills in preview
    const parts = content.split(/(\[@[^\]]+\]\([^)]+\))/g);
    return parts.map((part, i) => {
      const match = part.match(/\[@([^\]]+)\]\((contact|deal):([^)]+)\)/);
      if (match) {
        const [, label, kind, id] = match;
        const href =
          kind === 'contact' ? `/s/${slug}/contacts/${id}` : `/s/${slug}/deals/${id}`;
        return (
          <a
            key={i}
            href={href}
            className="inline-flex items-center rounded-md bg-primary/10 px-1.5 py-0.5 text-sm font-medium text-primary hover:bg-primary/20 transition-colors"
          >
            @{label}
          </a>
        );
      }
      return <span key={i}>{part}</span>;
    });
  };

  return (
    <div className="flex h-full">
      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
      <div className="w-56 shrink-0 border-r bg-muted/30 flex flex-col">
        <div className="px-3 py-3 border-b">
          <h2 className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
            <StickyNote className="h-4 w-4" />
            Notes
          </h2>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-1.5 space-y-0.5">
            {notes.map((note) => (
              <div
                key={note.id}
                className={cn(
                  'group flex items-center justify-between rounded-md px-2 py-1.5 text-sm cursor-pointer transition-colors',
                  activeId === note.id
                    ? 'bg-primary/10 text-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
                onClick={() => loadNote(note.id)}
              >
                <span className="flex items-center gap-1.5 truncate">
                  <FileText className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{note.icon ? `${note.icon} ` : ''}{note.title || 'Untitled'}</span>
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteNote(note.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-destructive/10 hover:text-destructive transition-opacity"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </ScrollArea>

        <div className="p-2 border-t">
          <Button
            variant="outline"
            size="sm"
            className="w-full border-dashed text-muted-foreground"
            onClick={createNote}
            disabled={creating}
          >
            {creating ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5 mr-1.5" />
            )}
            New page
          </Button>
        </div>
      </div>

      {/* ── Editor ──────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {activeId && noteDetail ? (
          <>
            <div className="flex-1 overflow-auto px-8 py-6 lg:px-16 lg:py-10 max-w-3xl mx-auto w-full">
              {/* Title */}
              <input
                type="text"
                value={title}
                onChange={(e) => handleTitleChange(e.target.value)}
                placeholder="Untitled"
                className="w-full text-2xl font-bold bg-transparent border-none outline-none placeholder:text-muted-foreground/40 mb-4"
              />

              {/* Content area with mention support */}
              <div className="relative">
                <textarea
                  ref={contentRef}
                  value={content}
                  onChange={handleContentInput}
                  onKeyDown={handleContentKeyDown}
                  onBlur={() => {
                    // Delay closing so clicks on mention items register
                    setTimeout(() => closeMention(), 200);
                  }}
                  placeholder="Start writing... Type @ to mention a contact or deal"
                  className="w-full min-h-[50vh] text-base bg-transparent border-none outline-none resize-none placeholder:text-muted-foreground/40 leading-relaxed"
                />

                {/* Mention dropdown */}
                {mentionOpen && mentionPos && filteredMentions.length > 0 && (
                  <div
                    ref={mentionListRef}
                    className="absolute z-50 w-64 max-h-56 overflow-auto rounded-lg border bg-popover shadow-lg"
                    style={{ top: mentionPos.top, left: mentionPos.left }}
                  >
                    {filteredMentions.map((m, i) => (
                      <button
                        key={`${m.kind}-${m.id}`}
                        className={cn(
                          'w-full text-left px-3 py-2 text-sm flex items-center gap-2 transition-colors',
                          i === mentionIndex ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50',
                        )}
                        onMouseDown={(e) => {
                          e.preventDefault(); // prevent blur
                          insertMention(m);
                        }}
                        onMouseEnter={() => setMentionIndex(i)}
                      >
                        <span
                          className={cn(
                            'inline-flex items-center justify-center h-5 w-5 rounded text-[10px] font-bold shrink-0',
                            m.kind === 'contact'
                              ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                              : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300',
                          )}
                        >
                          {m.kind === 'contact' ? 'C' : 'D'}
                        </span>
                        <span className="flex flex-col min-w-0">
                          <span className="truncate font-medium">{m.label}</span>
                          {m.sub && (
                            <span className="truncate text-xs text-muted-foreground">{m.sub}</span>
                          )}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Rendered content preview (mentions as pills) */}
              {content && /\[@[^\]]+\]\([^)]+\)/.test(content) && (
                <div className="mt-6 pt-6 border-t">
                  <p className="text-xs text-muted-foreground mb-2 font-medium">Preview</p>
                  <div className="text-sm leading-relaxed whitespace-pre-wrap">
                    {renderContent()}
                  </div>
                </div>
              )}
            </div>

            {/* Save status bar */}
            <div className="shrink-0 border-t px-4 py-1.5 flex items-center justify-end">
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                {saveStatus === 'saving' && (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Saving...
                  </>
                )}
                {saveStatus === 'saved' && (
                  <>
                    <Check className="h-3 w-3 text-green-500" />
                    Saved
                  </>
                )}
                {saveStatus === 'idle' && noteDetail.updatedAt && (
                  <span>
                    Last edited {new Date(noteDetail.updatedAt).toLocaleDateString()}
                  </span>
                )}
              </span>
            </div>
          </>
        ) : loadingNote ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          /* Empty state */
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
            <div className="rounded-full bg-muted p-4 mb-4">
              <StickyNote className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-1">
              {notes.length === 0 ? 'Create your first note' : 'Select a note'}
            </h3>
            <p className="text-sm text-muted-foreground mb-4 max-w-xs">
              {notes.length === 0
                ? 'Notes help you keep track of ideas, meeting notes, and property details.'
                : 'Choose a note from the sidebar to start editing.'}
            </p>
            {notes.length === 0 && (
              <Button onClick={createNote} disabled={creating}>
                {creating ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4 mr-2" />
                )}
                New page
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
