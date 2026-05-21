-- ═══════════════════════════════════════════════════════════════════════════
-- Folder — a Drive-like nested hierarchy for the Files page.
--
-- Files (File.folderId) and subfolders (Folder.parentId) both reparent to
-- root via ON DELETE SET NULL, so deleting a folder never destroys its
-- contents — they just resurface at the top level.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "Folder" (
  "id"        text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "spaceId"   text NOT NULL REFERENCES "Space"("id") ON DELETE CASCADE,
  "userId"    text NOT NULL,                                  -- Clerk userId who created it
  "name"      text NOT NULL,
  "parentId"  text REFERENCES "Folder"("id") ON DELETE SET NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

-- Hot path: list a space's folders, grouped by parent for tree rendering.
CREATE INDEX IF NOT EXISTS "Folder_spaceId_parentId_idx"
  ON "Folder" ("spaceId", "parentId");

ALTER TABLE "Folder" ENABLE ROW LEVEL SECURITY;

-- File gains a nullable folder. NULL = lives at the root of the Files page.
ALTER TABLE "File"
  ADD COLUMN IF NOT EXISTS "folderId" text REFERENCES "Folder"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "File_spaceId_folderId_idx"
  ON "File" ("spaceId", "folderId");
