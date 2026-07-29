'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Braces, FileText, Loader2, Send, SquareTerminal, Table2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { WorkspaceRunView } from '@/lib/workspace-runs/types';

const active = (status: string) => ['queued', 'launching', 'running'].includes(status);

export function WorkspaceRunPanel({ runId, slug, onContinue, followUpsEnabled = false, refreshToken = 0 }: { runId: string | null; slug: string; onContinue?: () => void; followUpsEnabled?: boolean; refreshToken?: number }) {
  const [run, setRun] = useState<WorkspaceRunView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [instruction, setInstruction] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [continuationError, setContinuationError] = useState<string | null>(null);
  const continuationKeyRef = useRef<string | null>(null);
  const load = useCallback(async () => {
    if (!runId) return;
    const res = await fetch(`/api/workspace-runs/${encodeURIComponent(runId)}?slug=${encodeURIComponent(slug)}`, { cache: 'no-store' });
    if (!res.ok) { setError('Workspace state is unavailable.'); return; }
    setRun((await res.json() as { run: WorkspaceRunView }).run); setError(null);
  }, [runId, slug]);
  // A continuation can be enqueued for the run already shown here. Reload
  // immediately on that bounded parent signal; polling only follows once the
  // refreshed state reveals an active task.
  useEffect(() => { void load(); }, [load, refreshToken]);
  useEffect(() => {
    if (!run || (!active(run.status) && !run.tasks.some((task) => active(task.status)))) return;
    const timer = window.setInterval(() => void load(), 2500);
    return () => window.clearInterval(timer);
  }, [load, run]);
  const cancel = async () => {
    if (!runId) return;
    await fetch(`/api/workspace-runs/${encodeURIComponent(runId)}?slug=${encodeURIComponent(slug)}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'cancel' }) });
    await load();
  };
  const continueWorkspace = async () => {
    if (!runId || instruction.trim().length < 3 || submitting) return;
    setSubmitting(true); setContinuationError(null);
    try {
      const key = continuationKeyRef.current ?? crypto.randomUUID();
      continuationKeyRef.current = key;
      const res = await fetch(`/api/workspace-runs/${encodeURIComponent(runId)}/tasks?slug=${encodeURIComponent(slug)}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ instruction: instruction.trim(), idempotencyKey: key }) });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof payload.error === 'string' ? payload.error : 'Could not continue this workspace.');
      continuationKeyRef.current = null; setInstruction(''); await load();
    } catch (err) { setContinuationError(err instanceof Error ? err.message : 'Could not continue this workspace.'); } finally { setSubmitting(false); }
  };
  const cancelTask = async (taskId: string) => {
    if (!runId) return;
    const res = await fetch(`/api/workspace-runs/${encodeURIComponent(runId)}/tasks?slug=${encodeURIComponent(slug)}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'cancel', taskId }) });
    if (!res.ok) { const payload = await res.json().catch(() => ({})); setContinuationError(typeof payload.error === 'string' ? payload.error : 'Could not cancel the workspace continuation.'); }
    await load();
  };
  if (!runId) return <div className="grid h-full place-items-center p-6 text-center"><div><SquareTerminal className="mx-auto mb-3 size-5 text-muted-foreground" /><p className="text-sm font-medium">No workspace open</p><p className="mt-1 text-xs text-muted-foreground">Start a Workspace Run from /work to see Chippi’s files and live execution here.</p></div></div>;
  if (!run) return <div className="p-5 text-xs text-muted-foreground"><Loader2 className="mr-2 inline size-3 animate-spin" />Loading workspace…</div>;
  const taskActive = run.tasks.some((task) => active(task.status));
  return <div className="flex h-full min-h-0 flex-col">
    <div className="border-b border-border/60 px-4 py-3"><div className="flex items-start gap-2"><SquareTerminal className="mt-0.5 size-4" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{run.goal}</p><p className="mt-0.5 text-[11px] text-muted-foreground">{run.status === 'running' ? 'Chippy is working in an isolated workspace.' : run.status}</p></div>{active(run.status) && <Button size="xs" variant="ghost" onClick={cancel}><X className="mr-1 size-3" />Cancel</Button>}</div></div>
    <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
      <section><p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Live work</p><TerminalEvents events={run.events} empty="Waiting for the isolated workspace to start…" />{error && <p className="mt-2 text-xs text-destructive">{error}</p>}</section>
      {followUpsEnabled && run.status === 'completed' && <section className="border-t border-border/50 pt-4"><p className="text-sm font-medium">Continue this workspace</p><p className="mt-1 text-xs text-muted-foreground">Ask for a bounded private follow-up. Chippi can produce a grounded report, sorted comps CSV, and action register in a fresh isolated terminal.</p><div className="mt-3 flex gap-2"><textarea value={instruction} onChange={(event) => setInstruction(event.target.value.slice(0, 1000))} disabled={taskActive || submitting} rows={3} placeholder="For example: create a seller report, price-sorted comps CSV, and action register." className="min-w-0 flex-1 resize-none rounded-md border border-border bg-background px-3 py-2 text-xs outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-ring disabled:opacity-60" /><Button size="sm" className="self-end" disabled={taskActive || submitting || instruction.trim().length < 3} onClick={continueWorkspace}>{submitting ? <Loader2 className="size-3 animate-spin" /> : <Send className="size-3" />}<span className="sr-only">Continue workspace</span></Button></div>{continuationError && <p className="mt-2 text-xs text-destructive">{continuationError}</p>}</section>}
      {run.tasks.map((task) => <section key={task.id} className="border-t border-border/50 pt-4"><div className="flex items-start gap-2"><SquareTerminal className="mt-0.5 size-3.5 text-muted-foreground" /><div className="min-w-0 flex-1"><p className="text-xs font-medium">Continuation {task.sequence}</p><p className="mt-0.5 text-[11px] text-muted-foreground">{task.instruction}</p></div><span className="text-[11px] text-muted-foreground">{task.status}</span>{active(task.status) && <Button size="xs" variant="ghost" onClick={() => void cancelTask(task.id)}><X className="mr-1 size-3" />Cancel</Button>}</div>{task.operations.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{task.operations.map((operation) => <span key={operation.id} className="inline-flex items-center gap-1 rounded-md border border-border/60 px-2 py-1 text-[11px] text-muted-foreground"><OperationIcon type={operation.type} />{operation.type === 'grounded_markdown_report' ? 'Markdown report' : operation.type === 'comps_csv_projection' ? 'Comps CSV' : 'Action register'}</span>)}</div>}<div className="mt-3 rounded-lg border border-border/60 bg-muted/[0.18] p-3 font-mono text-[11px] leading-relaxed">{task.commandPlan.map((step, index) => <div key={`${task.id}:${index}`} className="mb-2 last:mb-0"><span className="text-muted-foreground/60">{String(index + 1).padStart(2, '0')}</span> $ {step.command}<div className="ml-5 text-muted-foreground">{step.description}</div></div>)}</div><div className="mt-2"><TerminalEvents events={task.events} empty="" /></div>{task.error && <p className="mt-2 text-xs text-destructive">{task.error}</p>}<FileLinks runId={run.id} slug={slug} files={task.files} /></section>)}
      <section><p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Files</p><FileLinks runId={run.id} slug={slug} files={run.files} empty="Files will appear here as Chippi creates them." /></section>
    </div>
    <div className="border-t border-border/60 p-3"><Button size="sm" variant="outline" className="w-full" onClick={onContinue}>Continue in chat</Button></div>
  </div>;
}

function TerminalEvents({ events, empty }: { events: Array<{ id: string; sequence: number; message: string; command: string | null; output: string | null }>; empty: string }) {
  if (!events.length && !empty) return null;
  return <div className="rounded-lg border border-border/60 bg-muted/[0.18] p-3 font-mono text-[11px] leading-relaxed">{events.length ? events.map((event) => <div key={event.id} className="mb-2 last:mb-0"><span className="text-muted-foreground/60">{event.sequence.toString().padStart(2, '0')}</span> <span>{event.message}</span>{event.command && <div className="mt-1 text-muted-foreground">$ {event.command}</div>}{event.output && <pre className="mt-1 whitespace-pre-wrap text-muted-foreground">{event.output}</pre>}</div>) : <span className="text-muted-foreground">{empty}</span>}</div>;
}
function OperationIcon({ type }: { type: 'grounded_markdown_report' | 'comps_csv_projection' | 'json_action_register' }) { return type === 'comps_csv_projection' ? <Table2 className="size-3" /> : type === 'json_action_register' ? <Braces className="size-3" /> : <FileText className="size-3" />; }
function FileLinks({ runId, slug, files, empty }: { runId: string; slug: string; files: Array<{ id: string; fileId: string | null; name: string; sizeBytes: number }>; empty?: string }) {
  if (!files.length) return empty ? <p className="text-xs text-muted-foreground">{empty}</p> : null;
  return <div className="space-y-1">{files.map((file) => <a key={file.id} href={file.fileId ? `/api/workspace-runs/${encodeURIComponent(runId)}/files/${encodeURIComponent(file.id)}?slug=${encodeURIComponent(slug)}` : undefined} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-muted">{file.name.endsWith('.csv') ? <Table2 className="size-3.5" /> : file.name.endsWith('.json') ? <Braces className="size-3.5" /> : <FileText className="size-3.5" />}{file.name}<span className="ml-auto text-muted-foreground">{Math.max(1, Math.ceil(file.sizeBytes / 1024))} KB</span></a>)}</div>;
}
