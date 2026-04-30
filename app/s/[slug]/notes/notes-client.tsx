'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import {
  Plus,
  Trash2,
  Check,
  Loader2,
  StickyNote,
  Download,
  ArrowLeft,
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
  const [mobileSidebar, setMobileSidebar] = useState(true); // show sidebar by default on mobile when no note selected

  // Editor state
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');

  // Mention state
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mentionPos, setMentionPos] = useState<{ top: number; left: number } | null>(null);
  const [mentionStart, setMentionStart] = useState<number | null>(null);

  // Slash command state
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState('');
  const [slashIndex, setSlashIndex] = useState(0);
  const [slashStart, setSlashStart] = useState<number | null>(null);
  const [slashPos, setSlashPos] = useState<{ top: number; left: number } | null>(null);

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
      setMobileSidebar(false); // Switch to editor view on mobile
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
            // Update sidebar title and the active note detail's updatedAt
            setNotes((prev) =>
              prev.map((n) =>
                n.id === noteId ? { ...n, title: updated.title, updatedAt: updated.updatedAt } : n,
              ),
            );
            setNoteDetail((prev) =>
              prev && prev.id === noteId ? { ...prev, updatedAt: updated.updatedAt } : prev,
            );
            // Reset to idle after briefly showing "Saved"
            setTimeout(() => setSaveStatus('idle'), 2000);
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
      if (!res.ok) {
        toast.error('Failed to create note');
        return;
      }
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
    } catch {
      toast.error('Failed to create note');
    } finally {
      setCreating(false);
    }
  };

  const deleteNote = async (id: string) => {
    try {
      const res = await fetch(`/api/notes/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        toast.error('Failed to delete note');
        return;
      }
      // Cancel any pending auto-save for this note before removing it
      if (saveTimeout.current) {
        clearTimeout(saveTimeout.current);
        saveTimeout.current = null;
      }
      setNotes((prev) => prev.filter((n) => n.id !== id));
      if (activeId === id) {
        setActiveId(null);
        setNoteDetail(null);
        setTitle('');
        setContent('');
        setSaveStatus('idle');
      }
    } catch {
      toast.error('Failed to delete note');
    }
  };

  // ── Mention handling in textarea ───────────────────────────────────────────

  const handleContentKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionOpen) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIndex((i) => Math.min(i + 1, filteredMentions.length - 1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setMentionIndex((i) => Math.max(i - 1, 0)); }
      else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); if (filteredMentions[mentionIndex]) insertMention(filteredMentions[mentionIndex]); }
      else if (e.key === 'Escape') { e.preventDefault(); closeMention(); }
      return;
    }
    if (slashOpen) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSlashIndex((i) => Math.min(i + 1, filteredSlashCommands.length - 1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setSlashIndex((i) => Math.max(i - 1, 0)); }
      else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); if (filteredSlashCommands[slashIndex]) insertSlashCommand(filteredSlashCommands[slashIndex]); }
      else if (e.key === 'Escape') { e.preventDefault(); closeSlash(); }
      return;
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

    // Detect / slash command (at start of line)
    const slashIdx = textBefore.lastIndexOf('/');
    if (slashIdx >= 0) {
      const charBeforeSlash = slashIdx > 0 ? textBefore[slashIdx - 1] : '\n';
      const slashQuery = textBefore.slice(slashIdx + 1);
      if ((charBeforeSlash === '\n' || slashIdx === 0) && !/\s/.test(slashQuery)) {
        setSlashOpen(true);
        setSlashQuery(slashQuery);
        setSlashIndex(0);
        setSlashStart(slashIdx);
        const lines = textBefore.split('\n');
        const lineNum = lines.length - 1;
        setSlashPos({ top: (lineNum + 1) * 24 + 4, left: 0 });
        return;
      }
    }
    closeSlash();
  };

  const insertMention = (mention: MentionOption) => {
    if (mentionStart === null) return;
    const textarea = contentRef.current;
    if (!textarea) return;

    const before = content.slice(0, mentionStart);
    const after = content.slice(textarea.selectionStart);
    const mentionText = `@${mention.label}`;
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

  // ── Slash commands ────────────────────────────────────────────────────────
  const SLASH_COMMANDS = [
    { id: 'heading', label: 'Heading', desc: 'Large section heading', insert: '## ' },
    { id: 'subheading', label: 'Sub-heading', desc: 'Smaller heading', insert: '### ' },
    { id: 'bullet', label: 'Bullet list', desc: 'Create a bullet list', insert: '- ' },
    { id: 'numbered', label: 'Numbered list', desc: 'Create a numbered list', insert: '1. ' },
    { id: 'checkbox', label: 'Checkbox', desc: 'To-do item', insert: '- [ ] ' },
    { id: 'divider', label: 'Divider', desc: 'Horizontal line', insert: '\n---\n' },
    { id: 'quote', label: 'Quote', desc: 'Block quote', insert: '> ' },
    { id: 'code', label: 'Code block', desc: 'Fenced code block', insert: '```\n\n```' },
    { id: 'table', label: 'Table', desc: 'Insert a table', insert: '| Column 1 | Column 2 | Column 3 |\n| --- | --- | --- |\n| | | |\n' },
    { id: 'image', label: 'Image', desc: 'Embed an image by URL', insert: '![alt text](https://)' },
    { id: 'link', label: 'Link', desc: 'Insert a hyperlink', insert: '[link text](https://)' },
    { id: 'callout', label: 'Callout', desc: 'Highlighted note block', insert: '> 💡 ' },
    { id: 'date', label: 'Today\'s date', desc: 'Insert current date', insert: new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) },
  ];

  const filteredSlashCommands = SLASH_COMMANDS.filter(
    (c) => c.label.toLowerCase().includes(slashQuery.toLowerCase()) || c.id.includes(slashQuery.toLowerCase()),
  );

  const insertSlashCommand = (cmd: typeof SLASH_COMMANDS[0]) => {
    if (slashStart === null) return;
    const textarea = contentRef.current;
    if (!textarea) return;

    const before = content.slice(0, slashStart);
    const after = content.slice(textarea.selectionStart);
    const newContent = before + cmd.insert + after;

    setContent(newContent);
    closeSlash();
    if (activeId) autoSave(activeId, { title, content: newContent });

    requestAnimationFrame(() => {
      if (contentRef.current) {
        const cursorOffset = cmd.insert.includes('```') ? cmd.insert.indexOf('\n') + 1 : cmd.insert.length;
        const pos = before.length + cursorOffset;
        contentRef.current.focus();
        contentRef.current.setSelectionRange(pos, pos);
      }
    });
  };

  const closeSlash = () => {
    setSlashOpen(false);
    setSlashQuery('');
    setSlashIndex(0);
    setSlashStart(null);
    setSlashPos(null);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  // Build a lookup of known names → { kind, id, href }
  const mentionLookup = useMemo(() => {
    const map = new Map<string, { kind: string; id: string; href: string }>();
    for (const c of contacts) {
      map.set(c.name.toLowerCase(), { kind: 'contact', id: c.id, href: `/s/${slug}/contacts/${c.id}` });
    }
    for (const d of deals) {
      map.set(d.title.toLowerCase(), { kind: 'deal', id: d.id, href: `/s/${slug}/deals/${d.id}` });
    }
    return map;
  }, [contacts, deals, slug]);

  // Render content with @mentions highlighted as bold orange links
  const renderHighlightedContent = useCallback((text: string) => {
    if (!text) return null;
    // Match @Name patterns (word chars, spaces, hyphens, apostrophes after @)
    const parts = text.split(/(@[\w][\w\s\-']*[\w])/g);
    return parts.map((part, i) => {
      if (part.startsWith('@')) {
        const name = part.slice(1);
        const match = mentionLookup.get(name.toLowerCase());
        if (match) {
          return (
            <a
              key={i}
              href={match.href}
              className="font-bold text-primary hover:underline cursor-pointer"
              onClick={(e) => e.stopPropagation()}
            >
              {part}
            </a>
          );
        }
      }
      return <span key={i}>{part}</span>;
    });
  }, [mentionLookup]);

  // Export note as Markdown
  const exportMarkdown = useCallback(() => {
    const md = `# ${title}\n\n${content}`;
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title || 'note'}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [title, content]);

  // HTML-escape to prevent XSS when injecting into document.write
  const escHtml = useCallback((s: string): string => {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }, []);

  // Export note as PDF (uses browser print)
  const exportPDF = useCallback(() => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    const safeTitle = escHtml(title);
    const safeContent = escHtml(content).replace(/@([\w][\w\s\-']*[\w])/g, (match) => {
      const name = match.slice(1);
      const found = mentionLookup.get(name.toLowerCase());
      return found ? `<span class="mention">${match}</span>` : match;
    });
    printWindow.document.write(`
      <html>
        <head>
          <title>${safeTitle || 'Note'}</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 700px; margin: 40px auto; padding: 0 20px; color: #1a1a1a; }
            h1 { font-size: 28px; margin-bottom: 24px; }
            .content { font-size: 15px; line-height: 1.8; white-space: pre-wrap; }
            .mention { font-weight: 700; color: #ff964f; }
          </style>
        </head>
        <body>
          <h1>${safeTitle || 'Untitled'}</h1>
          <div class="content">${safeContent}</div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  }, [title, content, mentionLookup, escHtml]);

  return (
    <div className="flex h-full flex-col">
      {/* ── Page header ─────────────────────────────────────────────────── */}
      <header className="flex items-end justify-between gap-4 px-6 pt-6 pb-4">
        <h1
          className="text-3xl tracking-tight text-foreground"
          style={{ fontFamily: 'var(--font-title)' }}
        >
          Notes
        </h1>
        <button
          type="button"
          onClick={createNote}
          disabled={creating}
          className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 h-8 text-xs font-medium text-background hover:bg-foreground/90 transition-colors duration-150 disabled:opacity-50"
        >
          {creating ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Plus className="h-3.5 w-3.5" />
          )}
          New note
        </button>
      </header>

      <div className="flex flex-1 min-h-0 border-t border-border/70">
      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
      <div className={cn(
        'w-full md:w-64 shrink-0 border-r border-border/70 bg-background flex-col',
        // Mobile: show sidebar when mobileSidebar is true, hide when editing
        mobileSidebar ? 'flex md:flex' : 'hidden md:flex',
      )}>
        <ScrollArea className="flex-1">
          <div>
            {notes.length === 0 ? (
              <div className="flex flex-col items-center text-center py-12 px-6 space-y-3">
                <StickyNote size={28} className="text-muted-foreground/40" />
                <p
                  className="text-base text-foreground"
                  style={{ fontFamily: 'var(--font-title)' }}
                >
                  No notes yet
                </p>
                <p className="text-sm text-muted-foreground max-w-xs">
                  Capture meeting notes, ideas, and property details — they live here.
                </p>
              </div>
            ) : (
              notes.map((note) => {
                const isActive = activeId === note.id;
                return (
                  <div
                    key={note.id}
                    className={cn(
                      'group relative flex items-start justify-between gap-2 px-4 py-3 text-sm cursor-pointer border-b border-border/70 transition-colors duration-150',
                      isActive
                        ? 'bg-foreground/[0.045]'
                        : 'hover:bg-foreground/[0.04]',
                    )}
                    onClick={() => loadNote(note.id)}
                  >
                    {isActive && (
                      <span
                        aria-hidden
                        className="absolute left-0 top-0 bottom-0 w-0.5 bg-foreground"
                      />
                    )}
                    <div className="flex-1 min-w-0 space-y-0.5">
                      <p className="truncate text-sm text-foreground">
                        {note.icon ? `${note.icon} ` : ''}{note.title || 'Untitled'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(note.updatedAt).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteNote(note.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded text-muted-foreground hover:text-destructive transition-opacity"
                      aria-label="Delete note"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>
      </div>

      {/* ── Editor ──────────────────────────────────────────────────────────── */}
      <div className={cn(
        'flex-1 flex flex-col min-w-0',
        mobileSidebar ? 'hidden md:flex' : 'flex',
      )}>
        {/* Mobile back button */}
        <div className="md:hidden flex items-center gap-2 px-4 py-2 border-b">
          <button
            onClick={() => setMobileSidebar(true)}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft size={16} />
            All notes
          </button>
        </div>
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

              {/* Content area — textarea with highlighted mention overlay */}
              <div className="relative min-h-[50vh]">
                {/* Highlighted overlay (shows formatted @mentions in orange bold) */}
                <div
                  className="absolute inset-0 text-base leading-relaxed whitespace-pre-wrap break-words pointer-events-none"
                  aria-hidden
                >
                  {content ? renderHighlightedContent(content) : (
                    <span className="text-muted-foreground/40">Start writing... Type @ to mention a contact or deal</span>
                  )}
                  {/* Extra space so overlay matches textarea height */}
                  <span className="invisible">.</span>
                </div>

                {/* Actual textarea — transparent text, visible caret */}
                <textarea
                  ref={contentRef}
                  value={content}
                  onChange={handleContentInput}
                  onKeyDown={handleContentKeyDown}
                  onBlur={() => setTimeout(() => { closeMention(); closeSlash(); }, 200)}
                  placeholder=""
                  className="relative w-full min-h-[50vh] text-base bg-transparent border-none outline-none resize-none leading-relaxed text-transparent caret-foreground"
                  spellCheck={false}
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

                {/* Slash command dropdown */}
                {slashOpen && slashPos && filteredSlashCommands.length > 0 && (
                  <div
                    className="absolute z-50 w-72 max-h-64 overflow-auto rounded-lg border bg-popover shadow-lg"
                    style={{ top: slashPos.top, left: slashPos.left }}
                  >
                    <div className="px-3 py-1.5 border-b">
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Insert block</p>
                    </div>
                    {filteredSlashCommands.map((cmd, i) => (
                      <button
                        key={cmd.id}
                        className={cn(
                          'w-full text-left px-3 py-2 text-sm flex flex-col transition-colors',
                          i === slashIndex ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50',
                        )}
                        onMouseDown={(e) => { e.preventDefault(); insertSlashCommand(cmd); }}
                        onMouseEnter={() => setSlashIndex(i)}
                      >
                        <span className="font-medium">{cmd.label}</span>
                        <span className="text-xs text-muted-foreground">{cmd.desc}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Status bar with export buttons */}
            <div className="shrink-0 border-t px-4 py-1.5 flex items-center justify-between">
              <div className="flex items-center gap-1">
                <button
                  onClick={exportMarkdown}
                  className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground rounded-md hover:bg-muted transition-colors"
                  title="Export as Markdown"
                >
                  <Download className="h-3 w-3" />
                  .md
                </button>
                <button
                  onClick={exportPDF}
                  className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground rounded-md hover:bg-muted transition-colors"
                  title="Export as PDF"
                >
                  <Download className="h-3 w-3" />
                  .pdf
                </button>
              </div>
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
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 space-y-3">
            <StickyNote size={28} className="text-muted-foreground/40" />
            <p
              className="text-base text-foreground"
              style={{ fontFamily: 'var(--font-title)' }}
            >
              {notes.length === 0 ? 'No notes yet' : 'Select a note'}
            </p>
            <p className="text-sm text-muted-foreground max-w-xs">
              {notes.length === 0
                ? 'Capture meeting notes, ideas, and property details — they live here.'
                : 'Choose a note from the sidebar to start editing.'}
            </p>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
