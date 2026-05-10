import { supabase } from '@/lib/supabase';

// Current OpenAI pricing (per 1K tokens, USD)
// Update these when OpenAI changes pricing
export const MODEL_PRICES: Record<string, { inputPer1k: number; outputPer1k: number }> = {
  'gpt-4o': { inputPer1k: 0.005, outputPer1k: 0.015 },
  'gpt-4o-mini': { inputPer1k: 0.00015, outputPer1k: 0.0006 },
  'gpt-4.1': { inputPer1k: 0.002, outputPer1k: 0.008 },
  'gpt-4.1-mini': { inputPer1k: 0.0004, outputPer1k: 0.0016 },
  'gpt-4.1-nano': { inputPer1k: 0.0001, outputPer1k: 0.0004 },
  'text-embedding-3-small': { inputPer1k: 0.00002, outputPer1k: 0 },
  'text-embedding-3-large': { inputPer1k: 0.00013, outputPer1k: 0 },
};

const FALLBACK_MODEL = 'gpt-4o-mini';

export function calculateStepCost(model: string, inputTokens: number, outputTokens: number): number {
  const prices = MODEL_PRICES[model] ?? MODEL_PRICES[FALLBACK_MODEL];
  const cost = (inputTokens / 1000) * prices.inputPer1k + (outputTokens / 1000) * prices.outputPer1k;
  // Round to 6 decimal places to match numeric(10,6) column precision
  return Math.round(cost * 1_000_000) / 1_000_000;
}

export async function recordStepCost(
  stepId: string,
  model: string,
  inputTokens: number,
  outputTokens: number
): Promise<void> {
  const costUsd = calculateStepCost(model, inputTokens, outputTokens);

  // 1. Update ExecutionStep with token counts and cost
  const { data: stepData, error: stepError } = await supabase
    .from('ExecutionStep')
    .update({
      inputTokens,
      outputTokens,
      costUsd,
    })
    .eq('id', stepId)
    .select('taskId')
    .single();

  if (stepError) {
    throw new Error(`Failed to update ExecutionStep ${stepId}: ${stepError.message}`);
  }

  const taskId: string = (stepData as { taskId: string }).taskId;

  // 2. Increment the parent AgentTask's running totals
  const { error: taskError } = await supabase.rpc('increment_agent_task_cost', {
    p_task_id: taskId,
    p_input_tokens: inputTokens,
    p_output_tokens: outputTokens,
    p_cost_usd: costUsd,
  });

  if (taskError) {
    // rpc not available — fall back to read-then-write increment
    const { data: taskData, error: readError } = await supabase
      .from('AgentTask')
      .select('inputTokens, outputTokens, estimatedCostUsd')
      .eq('id', taskId)
      .single();

    if (readError) {
      throw new Error(`Failed to read AgentTask ${taskId}: ${readError.message}`);
    }

    const current = taskData as {
      inputTokens: number;
      outputTokens: number;
      estimatedCostUsd: number;
    };

    const { error: writeError } = await supabase
      .from('AgentTask')
      .update({
        inputTokens: current.inputTokens + inputTokens,
        outputTokens: current.outputTokens + outputTokens,
        estimatedCostUsd:
          Math.round((Number(current.estimatedCostUsd) + costUsd) * 1_000_000) / 1_000_000,
        updatedAt: new Date().toISOString(),
      })
      .eq('id', taskId);

    if (writeError) {
      throw new Error(`Failed to update AgentTask ${taskId}: ${writeError.message}`);
    }
  }
}

export async function getTaskCostSummary(taskId: string): Promise<{
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
}> {
  const { data, error } = await supabase
    .from('AgentTask')
    .select('inputTokens, outputTokens, estimatedCostUsd')
    .eq('id', taskId)
    .single();

  if (error) {
    throw new Error(`Failed to fetch AgentTask ${taskId}: ${error.message}`);
  }

  const row = data as {
    inputTokens: number;
    outputTokens: number;
    estimatedCostUsd: number;
  };

  return {
    totalInputTokens: row.inputTokens,
    totalOutputTokens: row.outputTokens,
    totalCostUsd: Number(row.estimatedCostUsd),
  };
}
