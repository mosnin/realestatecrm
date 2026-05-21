import type { FileCategory } from '@/lib/storage/limits';

/** A file as the Files page sees it — a File-table upload or a chat attachment. */
export interface FileRow {
  id: string;
  name: string;
  mimeType: string;
  category: FileCategory;
  sizeBytes: number;
  isPublic: boolean;
  createdAt: string;
  /** 'chat' rows are read-only here — no rename, no move, no folder. */
  source: 'file' | 'chat';
  /** Folder the file lives in. null = root. */
  folderId: string | null;
  /** Short-lived signed thumbnail URL — present for image rows only. */
  previewUrl?: string;
}

/** A folder in the Files-page hierarchy. */
export interface FolderRow {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: string;
}

/** dataTransfer key for an in-page file drag (card → folder). */
export const FILE_DRAG_TYPE = 'application/x-chippi-file';
