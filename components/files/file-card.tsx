'use client';

import { useState } from 'react';
import { FileText, Image as ImageIcon, Film, Music, Trash2, Download, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatBytes, type FileCategory } from '@/lib/storage/limits';
import { FILE_DRAG_TYPE, type FileRow } from './types';

const CATEGORY_ICON: Record<FileCategory, React.ComponentType<{ size?: number; className?: string }>> = {
  image: ImageIcon,
  document: FileText,
  video: Film,
  audio: Music,
  other: FileText,
};

interface Props {
  file: FileRow;
  onPreview: (file: FileRow) => void;
  onDownload: (file: FileRow) => void;
  onDelete: (file: FileRow) => void;
  onRename: (file: FileRow, name: string) => void;
}

/** One file in the Drive-style grid: thumbnail (or type icon), inline-rename
 *  name, hover actions. Drag the card onto a folder to move it. */
export function FileCard({ file, onPreview, onDownload, onDelete, onRename }: Props) {
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(file.name);
  const [dragging, setDragging] = useState(false);

  const Icon = CATEGORY_ICON[file.category] ?? FileText;
  // Chat attachments are read-only here — managed inside the conversation.
  const canManage = file.source === 'file';

  function commitRename() {
    const next = draft.trim();
    setRenaming(false);
    if (next && next !== file.name) onRename(file, next);
    else setDraft(file.name);
  }

  return (
    <div
      draggable={canManage && !renaming}
      onDragStart={(e) => {
        e.dataTransfer.setData(FILE_DRAG_TYPE, file.id);
        e.dataTransfer.effectAllowed = 'move';
        setDragging(true);
      }}
      onDragEnd={() => setDragging(false)}
      className={cn(
        'group relative rounded-xl border border-border/60 bg-card overflow-hidden transition-all hover:border-border',
        dragging && 'opacity-40',
        canManage && !renaming && 'cursor-grab active:cursor-grabbing',
      )}
    >
      {/* Thumbnail / icon — click to preview */}
      <button
        type="button"
        onClick={() => onPreview(file)}
        title="Preview"
        className="block w-full aspect-square bg-muted/30"
      >
        {file.previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={file.previewUrl} alt={file.name} className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full items-center justify-center">
            <Icon className="h-8 w-8 text-muted-foreground/60" />
          </span>
        )}
      </button>

      {/* Name + meta */}
      <div className="space-y-0.5 p-2.5">
        {renaming ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') {
                setDraft(file.name);
                setRenaming(false);
              }
            }}
            className="w-full rounded border border-border bg-background px-1 py-0.5 text-[12px] font-medium outline-none focus:ring-1 focus:ring-foreground/30"
          />
        ) : (
          <button
            type="button"
            onClick={() => canManage && setRenaming(true)}
            title={canManage ? 'Click to rename' : file.name}
            className={cn(
              'block w-full truncate text-left text-[12px] font-medium text-foreground',
              canManage && 'hover:underline',
            )}
          >
            {file.name}
          </button>
        )}
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10.5px] tabular-nums text-muted-foreground">{formatBytes(file.sizeBytes)}</p>
          {file.source === 'chat' && (
            <span
              title="Uploaded inside a Chippi conversation"
              className="rounded-full bg-foreground/[0.06] px-1.5 py-px text-[9px] font-medium uppercase tracking-wider text-foreground/55"
            >
              Chat
            </span>
          )}
        </div>
      </div>

      {/* Hover actions */}
      <div className="absolute right-1.5 top-1.5 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <CardAction title="Preview" onClick={() => onPreview(file)}>
          <Eye size={12} />
        </CardAction>
        <CardAction title="Download" onClick={() => onDownload(file)}>
          <Download size={12} />
        </CardAction>
        <CardAction
          title="Delete"
          danger
          onClick={() => {
            if (confirm(`Delete "${file.name}"?`)) onDelete(file);
          }}
        >
          <Trash2 size={12} />
        </CardAction>
      </div>
    </div>
  );
}

function CardAction({
  children,
  title,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        'flex h-7 w-7 items-center justify-center rounded-md border bg-background/90 backdrop-blur-sm',
        danger
          ? 'border-rose-500/30 text-rose-600 hover:bg-rose-500/15 dark:text-rose-400'
          : 'border-border/60 text-foreground/70 hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}
