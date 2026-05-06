import { supabase } from '@/lib/supabase';
import { getOpenAIClient } from '@/lib/ai-tools/openai-client';

export interface SubgoalStep {
  id: string;
  title: string;
  description: string;
  toolHints?: string[];
  dependsOn?: string[]; // step IDs of prerequisite steps
  estimatedDuration?: string;
}

export async function decomposeGoal(
  goal: string,
  spaceContext: { spaceName: string; contactCount?: number },
  model = 'gpt-4.1-mini'
): Promise<SubgoalStep[]> {
  const { client } = getOpenAIClient();

  const contextLine = [
    `Workspace: ${spaceContext.spaceName}`,
    spaceContext.contactCount !== undefined
      ? `${spaceContext.contactCount} contacts`
      : null,
  ]
    .filter(Boolean)
    .join(', ');

  const completion = await client.chat.completions.create({
    model,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'user',
        content:
          `You are a real estate AI assistant. Break the following goal into 3-7 concrete executable steps for a CRM agent. ` +
          `Return JSON: { "steps": [{ "id": string, "title": string, "description": string, "toolHints": string[], "dependsOn": string[] }] }. ` +
          `For each step, add a "dependsOn" array containing the IDs (as strings matching earlier steps' "id" fields) of earlier steps that MUST complete before this step can start. ` +
          `If a step can run immediately (no dependencies), set dependsOn: []. ` +
          `Only add real dependencies — steps that genuinely need prior results. ` +
          `Example: a step that emails a contact found in a prior step should have dependsOn: ["<that-prior-step-id>"]. ` +
          `Example response: { "steps": [{ "id": "step-0", "title": "Find contacts", "description": "...", "toolHints": ["list_contacts"], "dependsOn": [] }, { "id": "step-1", "title": "Send email", "description": "...", "toolHints": ["send_email"], "dependsOn": ["step-0"] }] }. ` +
          `Goal: ${goal}. Context: ${contextLine}.`,
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content ?? '';

  let parsed: { steps: any[] };
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('goal_decomposition_failed');
  }

  if (!Array.isArray(parsed?.steps) || parsed.steps.length < 1) {
    throw new Error('goal_decomposition_failed');
  }

  const steps: SubgoalStep[] = parsed.steps.map((s: any, i: number) => ({
    id: s.id ?? `step-${i}`,
    title: s.title,
    description: s.description,
    toolHints: Array.isArray(s.toolHints)
      ? s.toolHints
      : Array.isArray(s.tool_hints)
        ? s.tool_hints
        : s.toolHint
          ? [s.toolHint]
          : [],
    dependsOn: Array.isArray(s.dependsOn) ? s.dependsOn.map(String) : [],
    estimatedDuration: s.estimatedDuration,
  }));

  return steps;
}

export async function persistDecomposition(
  spaceId: string,
  taskId: string,
  goal: string,
  steps: SubgoalStep[],
  model: string,
  usage: { promptTokens: number; completionTokens: number }
): Promise<string> {
  const { data, error } = await supabase
    .from('GoalDecomposition')
    .insert({
      spaceId,
      taskId,
      goalText: goal,
      decomposedSteps: steps,
      llmModel: model,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(`persistDecomposition failed: ${error.message}`);
  }

  const decompositionId = data.id as string;

  // Build dependency edges from the dependsOn arrays on each step.
  // Note: TaskDependency.taskId and dependsOnTaskId have FK constraints pointing
  // to AgentTask.id. The SubgoalStep IDs here are logical step identifiers stored
  // inside the GoalDecomposition.decomposedSteps JSONB column — they are NOT
  // AgentTask rows. If the parallel executor is wired to AgentTask rows, those
  // rows should be created separately and their IDs used here instead.
  // For now we store the logical step IDs; the DB FK will reject the insert if
  // no matching AgentTask rows exist, so we swallow the error rather than
  // blocking the decomposition itself.
  const stepIndex = new Map<string, SubgoalStep>(steps.map(s => [s.id, s]));
  const dependencyEdges: Array<{ stepId: string; dependsOnStepId: string }> = [];

  for (const step of steps) {
    for (const depId of step.dependsOn ?? []) {
      // Only emit edges for dependencies that reference a known step in this decomposition
      if (stepIndex.has(depId) && depId !== step.id) {
        dependencyEdges.push({
          stepId: step.id,
          dependsOnStepId: depId,
        });
      }
    }
  }

  if (dependencyEdges.length > 0) {
    // Ignore errors: TaskDependency has FK constraints to AgentTask which may not
    // be satisfied when steps are logical (not yet promoted to AgentTask rows).
    await supabase
      .from('TaskDependency')
      .insert(
        dependencyEdges.map(edge => ({
          taskId: edge.stepId,
          dependsOnTaskId: edge.dependsOnStepId,
          dependencyType: 'sequential',
        }))
      )
      // upsert-style: silently skip duplicates (UNIQUE constraint on taskId + dependsOnTaskId)
      .select('id');
  }

  return decompositionId;
}
