import { supabase } from '@/lib/supabase';
import { getOpenAIClient } from '@/lib/ai-tools/openai-client';

export interface SubgoalStep {
  index: number;
  title: string;
  description: string;
  toolHint?: string;
  estimatedTokens?: number;
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
          `Return JSON: { "steps": [{ "index": number, "title": string, "description": string, "toolHint": string }] }. ` +
          `Goal: ${goal}. Context: ${contextLine}.`,
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content ?? '';

  let parsed: { steps: SubgoalStep[] };
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('goal_decomposition_failed');
  }

  if (!Array.isArray(parsed?.steps) || parsed.steps.length < 1) {
    throw new Error('goal_decomposition_failed');
  }

  return parsed.steps;
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
      goal,
      steps,
      model,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(`persistDecomposition failed: ${error.message}`);
  }

  return data.id as string;
}
