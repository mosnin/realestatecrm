import type { WorkspaceRunTaskPlanStep } from './types';

export const WORKSPACE_OPERATION_TYPES = ['grounded_markdown_report', 'comps_csv_projection', 'json_action_register'] as const;
export type WorkspaceOperationType = typeof WORKSPACE_OPERATION_TYPES[number];
export type GroundedEvidence = { file: string; quote: string };
export type WorkspaceTaskOperation =
  | { id: string; type: 'grounded_markdown_report' }
  | { id: string; type: 'comps_csv_projection'; source: 'comps.csv'; columns: string[]; sort?: { column: string; direction: 'asc' | 'desc' }; rowLimit: number }
  | { id: string; type: 'json_action_register' };
export type WorkspaceTaskExecutionPlan = { summary: string; title: string; evidence: GroundedEvidence[]; nextSteps: string[]; operations: WorkspaceTaskOperation[] };
export type WorkspaceLegacyExecutionPlan = { summary: string; title: string; evidence: GroundedEvidence[]; nextSteps: string[] };
export type PersistedWorkspaceTaskPlan = WorkspaceTaskExecutionPlan | WorkspaceLegacyExecutionPlan;

const INPUT_NAME = /^(brief\.md|launch-checklist\.md|comps\.csv|handoff\.md|workspace-follow-up-[1-9][0-9]*\.md|workspace-report-[1-9][0-9]*\.md|workspace-comps-[1-9][0-9]*\.csv|workspace-actions-[1-9][0-9]*\.json)$/;
const OP_ID = /^[a-z][a-z0-9_-]{0,39}$/;
const text = (value: unknown, max: number, oneLine = false) => typeof value === 'string'
  ? (oneLine ? value.replace(/[\r\n]+/g, ' ') : value.replace(/\s+/g, ' ')).trim().slice(0, max)
  : '';

export function isSafeWorkspaceInputName(name: string): boolean { return INPUT_NAME.test(name); }
export function artifactName(type: WorkspaceOperationType, sequence: number): string {
  if (!Number.isInteger(sequence) || sequence < 1) throw new Error('Workspace task sequence is invalid.');
  return type === 'grounded_markdown_report' ? `workspace-report-${sequence}.md`
    : type === 'comps_csv_projection' ? `workspace-comps-${sequence}.csv`
    : `workspace-actions-${sequence}.json`;
}
export function artifactMime(type: WorkspaceOperationType): 'text/markdown' | 'text/csv' | 'application/json' {
  return type === 'grounded_markdown_report' ? 'text/markdown' : type === 'comps_csv_projection' ? 'text/csv' : 'application/json';
}
export function expectedArtifacts(plan: WorkspaceTaskExecutionPlan, sequence: number) {
  return plan.operations.map((operation) => ({ name: artifactName(operation.type, sequence), mimeType: artifactMime(operation.type), operationType: operation.type }));
}
export function expectedManifestForPersistedPlan(value: unknown, sequence: number) {
  if (!value || typeof value !== 'object' || !Number.isInteger(sequence) || sequence < 1) return null;
  const raw = value as { operations?: unknown; summary?: unknown; title?: unknown; evidence?: unknown; nextSteps?: unknown };
  if (raw.operations === undefined) return typeof raw.summary === 'string' && typeof raw.title === 'string' && Array.isArray(raw.evidence) && raw.evidence.length >= 1 && raw.evidence.length <= 3 && Array.isArray(raw.nextSteps) && raw.nextSteps.length >= 1 && raw.nextSteps.length <= 5
    ? [{ name: `workspace-follow-up-${sequence}.md`, mimeType: 'text/markdown' as const }]
    : null;
  const operations = Array.isArray(raw.operations) ? raw.operations : [];
  if (operations.length < 2 || operations.length > 3) return null;
  const reduced = operations.map((operation) => operation && typeof operation === 'object' ? operation as { id?: unknown; type?: unknown } : {});
  if (reduced.some((operation) => typeof operation.id !== 'string' || !OP_ID.test(operation.id) || !WORKSPACE_OPERATION_TYPES.includes(operation.type as WorkspaceOperationType)) || new Set(reduced.map((operation) => operation.id)).size !== reduced.length || new Set(reduced.map((operation) => operation.type)).size !== reduced.length) return null;
  return reduced.map((operation) => ({ name: artifactName(operation.type as WorkspaceOperationType, sequence), mimeType: artifactMime(operation.type as WorkspaceOperationType) }));
}

export type CompletionArtifact = { name: string; mimeType: 'text/markdown' | 'text/csv' | 'application/json'; content: Buffer };
/** Pure pre-upload boundary: callbacks never begin persistence until the full
 * completion manifest is exact, canonical, bounded, and MIME-derived. */
export function validateWorkspaceCompletionManifest(value: unknown, plan: unknown, sequence: number): CompletionArtifact[] | null {
  const expected = expectedManifestForPersistedPlan(plan, sequence);
  const rawFiles = Array.isArray(value) ? value : [];
  if (!expected || rawFiles.length !== expected.length || rawFiles.length < 1 || rawFiles.length > 3) return null;
  const names = new Set<string>(); const artifacts: CompletionArtifact[] = [];
  for (const expectedFile of expected) {
    const raw = rawFiles.find((file) => file && typeof file === 'object' && (file as { name?: unknown }).name === expectedFile.name) as { name?: unknown; content?: unknown; mimeType?: unknown } | undefined;
    if (!raw || names.has(expectedFile.name) || typeof raw.content !== 'string' || (raw.mimeType !== undefined && raw.mimeType !== expectedFile.mimeType) || !/^[A-Za-z0-9+/]*={0,2}$/.test(raw.content) || raw.content.length % 4 !== 0) return null;
    const content = Buffer.from(raw.content, 'base64');
    if (content.byteLength < 1 || content.byteLength > 32_000 || content.toString('base64') !== raw.content) return null;
    let decoded: string;
    try { decoded = new TextDecoder('utf-8', { fatal: true }).decode(content); } catch { return null; }
    if (expectedFile.mimeType === 'application/json') {
      try {
        const parsed = JSON.parse(decoded) as { title?: unknown; summary?: unknown; actions?: unknown };
        if (!parsed || Array.isArray(parsed) || typeof parsed.title !== 'string' || typeof parsed.summary !== 'string' || !Array.isArray(parsed.actions) || parsed.actions.some((action) => !action || typeof action !== 'object' || typeof (action as { nextStep?: unknown }).nextStep !== 'string' || !Array.isArray((action as { evidence?: unknown }).evidence))) return null;
      } catch { return null; }
    }
    names.add(expectedFile.name); artifacts.push({ name: expectedFile.name, mimeType: expectedFile.mimeType, content });
  }
  return names.size === rawFiles.length ? artifacts : null;
}

function csvHeader(content: string): string[] {
  const first = content.split(/\r?\n/, 1)[0] ?? '';
  const header = first.split(',').map((column) => column.trim());
  if (!header.length || header.some((column) => !/^[a-z][a-z0-9_]{0,63}$/i.test(column)) || new Set(header).size !== header.length) throw new Error('Workspace comps.csv header is invalid.');
  return header;
}

export function validateWorkspaceTaskPlan(value: unknown, files: Array<{ name: string; content: string }>): WorkspaceTaskExecutionPlan {
  if (!value || typeof value !== 'object' || !Array.isArray(files) || !files.length) throw new Error('Workspace continuation plan was not grounded in the private workspace.');
  const raw = value as Record<string, unknown>;
  const source = new Map<string, string>();
  for (const file of files) {
    if (!file || typeof file.name !== 'string' || !isSafeWorkspaceInputName(file.name) || typeof file.content !== 'string' || Buffer.byteLength(file.content, 'utf8') > 32_000 || source.has(file.name)) throw new Error('Workspace file manifest is unsafe.');
    source.set(file.name, file.content);
  }
  const summary = text(raw.summary, 180);
  const title = text(raw.title, 160, true);
  const evidence = (Array.isArray(raw.evidence) ? raw.evidence : []).map((item) => {
    const row = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    return { file: typeof row.file === 'string' ? row.file : '', quote: text(row.quote, 500) };
  }).filter((item) => item.file && item.quote && source.get(item.file)?.includes(item.quote));
  const nextSteps = (Array.isArray(raw.nextSteps) ? raw.nextSteps : []).map((step) => text(step, 220)).filter(Boolean);
  if (!summary || !title || evidence.length < 1 || evidence.length > 3 || new Set(evidence.map((item) => `${item.file}\0${item.quote}`)).size !== evidence.length || nextSteps.length < 1 || nextSteps.length > 5 || new Set(nextSteps).size !== nextSteps.length) throw new Error('Workspace continuation plan was not grounded in the private workspace.');
  const operations = Array.isArray(raw.operations) ? raw.operations : [];
  if (operations.length < 2 || operations.length > 3) throw new Error('Workspace continuation needs two or three typed operations.');
  const validated: WorkspaceTaskOperation[] = operations.map((item): WorkspaceTaskOperation => {
    const row = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    const id = typeof row.id === 'string' ? row.id : '';
    const type = row.type as WorkspaceOperationType;
    if (!OP_ID.test(id) || !WORKSPACE_OPERATION_TYPES.includes(type)) throw new Error('Workspace operation is invalid.');
    if (type === 'grounded_markdown_report') return { id, type: 'grounded_markdown_report' };
    if (type === 'json_action_register') return { id, type: 'json_action_register' };
    if (row.source !== 'comps.csv' || !source.has('comps.csv')) throw new Error('Workspace CSV operation must use comps.csv.');
    const columns = Array.isArray(row.columns) ? row.columns.filter((column): column is string => typeof column === 'string') : [];
    const header = csvHeader(source.get('comps.csv')!);
    if (columns.length < 1 || columns.length > 5 || new Set(columns).size !== columns.length || columns.some((column) => !header.includes(column))) throw new Error('Workspace CSV columns are invalid.');
    const rowLimit = row.rowLimit;
    if (typeof rowLimit !== 'number' || !Number.isInteger(rowLimit) || rowLimit < 1 || rowLimit > 20) throw new Error('Workspace CSV row limit is invalid.');
    let sort: { column: string; direction: 'asc' | 'desc' } | undefined;
    if (row.sort !== undefined) {
      const rawSort = row.sort && typeof row.sort === 'object' ? row.sort as Record<string, unknown> : {};
      if (typeof rawSort.column !== 'string' || !columns.includes(rawSort.column) || (rawSort.direction !== 'asc' && rawSort.direction !== 'desc')) throw new Error('Workspace CSV sort is invalid.');
      sort = { column: rawSort.column, direction: rawSort.direction };
    }
    return { id, type: 'comps_csv_projection', source: 'comps.csv', columns, rowLimit: rowLimit as number, ...(sort ? { sort } : {}) };
  });
  if (new Set(validated.map((operation) => operation.id)).size !== validated.length || new Set(validated.map((operation) => operation.type)).size !== validated.length) throw new Error('Workspace operations must be unique.');
  return { summary, title, evidence, nextSteps, operations: validated };
}

export function validatePersistedWorkspaceTaskPlan(value: unknown, files: Array<{ name: string; content: string }>): PersistedWorkspaceTaskPlan {
  if (value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, 'operations')) {
    if (!Array.isArray((value as { operations?: unknown }).operations)) throw new Error('Workspace continuation plan is unavailable.');
    return validateWorkspaceTaskPlan(value, files);
  }
  if (!value || typeof value !== 'object') throw new Error('Workspace continuation plan is unavailable.');
  const raw = value as Record<string, unknown>;
  // Reuse typed validation’s grounding and string bounds with two fixed
  // internal operations, then intentionally discard the synthetic operations.
  const legacy = validateWorkspaceTaskPlan({ ...raw, operations: [{ id: 'legacy-report', type: 'grounded_markdown_report' }, { id: 'legacy-actions', type: 'json_action_register' }] }, files);
  return { summary: legacy.summary, title: legacy.title, evidence: legacy.evidence, nextSteps: legacy.nextSteps };
}

export function commandPlanForWorkspaceTask(plan: WorkspaceTaskExecutionPlan): WorkspaceRunTaskPlanStep[] {
  return [
    { command: 'python /workspace/continue_workspace.py --inspect', description: 'Inspect the hydrated private workspace files.', operationType: 'inspect' },
    ...plan.operations.map((operation) => ({ command: `python /workspace/continue_workspace.py --execute ${operation.id}`, description: operation.type === 'grounded_markdown_report' ? 'Create a grounded Markdown report.' : operation.type === 'comps_csv_projection' ? 'Create a bounded comps CSV projection.' : 'Create a JSON action register.', operationId: operation.id, operationType: operation.type })),
    { command: 'python /workspace/continue_workspace.py --validate', description: 'Validate the typed private workspace artifacts.', operationType: 'validate' },
  ];
}
export function commandPlanForPersistedWorkspaceTask(plan: PersistedWorkspaceTaskPlan): WorkspaceRunTaskPlanStep[] {
  return 'operations' in plan ? commandPlanForWorkspaceTask(plan) : [
    { command: 'python /workspace/continue_workspace.py --inspect', description: 'Inspect the hydrated private workspace files.', operationType: 'inspect' },
    { command: 'python /workspace/continue_workspace.py --execute legacy-report', description: 'Create the legacy grounded Markdown follow-up.', operationId: 'legacy-report', operationType: 'grounded_markdown_report' },
    { command: 'python /workspace/continue_workspace.py --validate', description: 'Validate the legacy private workspace artifact.', operationType: 'validate' },
  ];
}
