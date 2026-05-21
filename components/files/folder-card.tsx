'use client';

import { useState } from 'react';
import { Folder as FolderIcon, Trash2, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FILE_DRAG_TYPE, type FolderRow } from './types';

interface Props {
  folder: FolderRow;
  /** Mount straight into rename mode — used for a just-created folder. */
  startRenaming?: boolean;
  onOpen: (folder: FolderRow) => void;
  onRename: (folder: FolderRow, name: string) => void;
  onDelete: (folder: FolderRow) => void;
  onMoveFileIn: (fileId: string, folderId: string) => void;
}

/** A folder in the grid: click to open, drop a file on it to move the file
 *  inside, hover for rename/delete. */
export function FolderCard({ folder, startRenaming, onOpen, onRename, onDelete, onMoveFileIn }: Props) {
  const [renaming, setRenaming] = useState(Boolean(startRenaming));
  const [draft, setDraft] = useState(folder.name);
  const [isOver, setIsOver] = useState(false);

  function commitRename() {
    const next = draft.trim();
    setRenaming(false);
    if (next && next !== folder.name) onRename(folder, next);
    else setDraft(folder.name);
  }

  return (
    <div
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(FILE_DRAG_TYPE)) {
          e.preventDefault();
          setIsOver(true);
        }
      }}
      onDragLeave={() => setIsOver(false)}
      onDrop={(e) => {
        setIsOver(false);
        const fileId = e.dataTransfer.getData(FILE_DRAG_TYPE);
        if (fileId) {
          e.preventDefault();
          e.stopPropagation();
          onMoveFileIn(fileId, folder.id);
        }
      }}
      className={cn(
        'group relative rounded-xl border bg-card transition-colors',
        isOver
          ? 'border-foreground bg-foreground/[0.04] ring-2 ring-foreground/20'
          : 'border-border/60 hover:border-border',
      )}
    >
      <button
        type="button"
        onClick={() => !renaming && onOpen(folder)}
        className="flex w-full items-center gap-2.5 p-3 text-left"
      >
        <FolderIcon className="h-5 w-5 flex-shrink-0 text-foreground/55" />
        {renaming ? (
          <input
            autoFocus
            value={draft}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') {
                setDraft(folder.name);
                setRenaming(false);
              }
            }}
            className="min-w-0 flex-1 rounded border border-border bg-background px-1 py-0.5 text-[13px] font-medium outline-none focus:ring-1 focus:ring-foreground/30"
          />
        ) : (
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">
            {folder.name}
          </span>
        )}
      </button>

      <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          type="button"
          title="Rename"
          onClick={(e) => {
            e.stopPropagation();
            setRenaming(true);
          }}
          className="flex h-7 w-7 items-center justify-center rounded-md border border-border/60 bg-background/90 text-foreground/70 hover:text-foreground"
        >
          <Pencil size={12} />
        </button>
        <button
          type="button"
          title="Delete folder"
          onClick={(e) => {
            e.stopPropagation();
            if (confirm(`Delete folder "${folder.name}"? Files inside move back to the top level.`)) {
              onDelete(folder);
            }
          }}
          className="flex h-7 w-7 items-center justify-center rounded-md border border-rose-500/30 bg-background/90 text-rose-600 hover:bg-rose-500/15 dark:text-rose-400"
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}
