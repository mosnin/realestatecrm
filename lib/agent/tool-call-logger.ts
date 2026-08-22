import { supabase } from '@/lib/supabase';
import { randomUUID } from 'crypto';
import { after } from 'next/server';
import { unscoped } from '@/lib/supabase-guard';
import { tenantTable } from '@/lib/tenant-db';


interface ToolCallRecord {
  stepId: string;
  spaceId: string;
  taskId?: string;
  toolName: string;
  startedAt: Date;
}

// In-flight tool call tracking
const inFlight = new Map<string, ToolCallRecord>();

async function persistToolCallStart(
  stepId: string,
  spaceId: string,
  toolName: string,
  args: Record<string, unknown>,
  taskId?: string
): Promise<string> {
  const inputSummary = JSON.stringify(args).slice(0, 500);

  try {
    await tenantTable(supabase, 'ExecutionStep', { spaceId }).insert({
      id: stepId,
      spaceId,
      taskId: taskId ?? null,
      stepIndex: 0,
      stepType: 'tool_call',
      toolName,
      inputSummary,
      status: 'running',
      startedAt: new Date().toISOString(),
    });
    inFlight.set(stepId, { stepId, spaceId, taskId, toolName, startedAt: new Date() });
  } catch {
    // Non-blocking — logging failure must never break the tool call
  }

  return stepId;
}

export async function logToolCallStart(
  spaceId: string,
  toolName: string,
  args: Record<string, unknown>,
  taskId?: string,
): Promise<string> {
  const stepId = randomUUID();
  const task = persistToolCallStart(stepId, spaceId, toolName, args, taskId);
  try {
    after(() => task);
  } catch {
    // Workers and unit tests may run outside a Next.js request context.
  }
  return task;
}

async function persistToolCallComplete(stepId: string, outputSummary: string): Promise<void> {
  const record = inFlight.get(stepId);
  if (!record) return;
  inFlight.delete(stepId);

  try {
    await unscoped(supabase.from('ExecutionStep'), 'post-fetch: caller verified parent scope before this id query').update({
      outputSummary: outputSummary.slice(0, 500),
      toolResult: { output: outputSummary.slice(0, 500) },
      status: 'completed',
      completedAt: new Date().toISOString(),
    }).eq('id', stepId);
  } catch {
    // Non-blocking
  }
}

export async function logToolCallComplete(stepId: string, outputSummary: string): Promise<void> {
  const task = persistToolCallComplete(stepId, outputSummary);
  try {
    after(() => task);
  } catch {
    // Workers and unit tests may run outside a Next.js request context.
  }
  await task;
}

async function persistToolCallError(stepId: string, error: string): Promise<void> {
  const record = inFlight.get(stepId);
  if (!record) return;
  inFlight.delete(stepId);

  try {
    await unscoped(supabase.from('ExecutionStep'), 'post-fetch: caller verified parent scope before this id query').update({
      errorMessage: error.slice(0, 1000),
      outputSummary: error.slice(0, 500),
      status: 'failed',
      completedAt: new Date().toISOString(),
    }).eq('id', stepId);
  } catch {
    // Non-blocking
  }
}

export async function logToolCallError(stepId: string, error: string): Promise<void> {
  const task = persistToolCallError(stepId, error);
  try {
    after(() => task);
  } catch {
    // Workers and unit tests may run outside a Next.js request context.
  }
  await task;
}
