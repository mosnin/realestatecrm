const MAX_PARENT_WORKSPACE_FILE_BYTES = 32_000;
const MAX_PARENT_WORKSPACE_BASE64_CHARS = 4 * Math.ceil(MAX_PARENT_WORKSPACE_FILE_BYTES / 3);
const CANONICAL_BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

const EXPECTED_PARENT_WORKSPACE_FILES = [
  { name: 'brief.md', mimeType: 'text/markdown' },
  { name: 'launch-checklist.md', mimeType: 'text/markdown' },
  { name: 'comps.csv', mimeType: 'text/csv' },
  { name: 'handoff.md', mimeType: 'text/markdown' },
] as const;

type ParentWorkspaceMimeType = typeof EXPECTED_PARENT_WORKSPACE_FILES[number]['mimeType'];

export type ParentWorkspaceCompletionArtifact = {
  name: typeof EXPECTED_PARENT_WORKSPACE_FILES[number]['name'];
  mimeType: ParentWorkspaceMimeType;
  content: Buffer;
};

/** Validate and decode the entire fixed parent manifest before object storage
 * is touched. MIME type is derived from the exact filename; a caller may omit
 * it for compatibility with the Modal runtime, but may never contradict it. */
export function validateParentWorkspaceCompletionManifest(
  value: unknown,
): ParentWorkspaceCompletionArtifact[] | null {
  if (!Array.isArray(value) || value.length !== EXPECTED_PARENT_WORKSPACE_FILES.length) {
    return null;
  }

  const expectedByName = new Map(
    EXPECTED_PARENT_WORKSPACE_FILES.map((file) => [file.name, file] as const),
  );
  const artifactsByName = new Map<string, ParentWorkspaceCompletionArtifact>();

  for (const candidate of value) {
    if (!candidate || typeof candidate !== 'object') return null;
    const raw = candidate as { name?: unknown; content?: unknown; mimeType?: unknown };
    if (typeof raw.name !== 'string' || typeof raw.content !== 'string') return null;
    const expected = expectedByName.get(raw.name as typeof EXPECTED_PARENT_WORKSPACE_FILES[number]['name']);
    if (!expected || artifactsByName.has(raw.name)) return null;
    if (raw.mimeType !== undefined && raw.mimeType !== expected.mimeType) return null;
    if (
      raw.content.length === 0
      || raw.content.length > MAX_PARENT_WORKSPACE_BASE64_CHARS
      || !CANONICAL_BASE64.test(raw.content)
    ) return null;

    const content = Buffer.from(raw.content, 'base64');
    if (
      content.byteLength < 1
      || content.byteLength > MAX_PARENT_WORKSPACE_FILE_BYTES
      || content.toString('base64') !== raw.content
    ) return null;
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(content);
    } catch {
      return null;
    }

    artifactsByName.set(raw.name, {
      name: expected.name,
      mimeType: expected.mimeType,
      content,
    });
  }

  if (artifactsByName.size !== EXPECTED_PARENT_WORKSPACE_FILES.length) return null;
  return EXPECTED_PARENT_WORKSPACE_FILES.map((file) => artifactsByName.get(file.name)!);
}
