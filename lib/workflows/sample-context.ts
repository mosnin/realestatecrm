import type { WorkflowContext } from './actions';

/**
 * Merge an untrusted test-run override into a synthetic context while pinning
 * entity IDs to the safe synthetic records.
 */
export function scrubSampleContext(
  override: unknown,
  synthetic: WorkflowContext,
): WorkflowContext {
  if (!override || typeof override !== 'object' || Array.isArray(override)) return synthetic;

  const merged: WorkflowContext = { ...synthetic, ...(override as Record<string, unknown>) };
  for (const key of ['contact', 'lead', 'deal'] as const) {
    const overrideEntity = (override as Record<string, unknown>)[key];
    if (overrideEntity && typeof overrideEntity === 'object' && !Array.isArray(overrideEntity)) {
      const syntheticEntity = synthetic[key] as Record<string, unknown> | undefined;
      merged[key] = { ...(overrideEntity as Record<string, unknown>), id: syntheticEntity?.id };
    }
  }
  return merged;
}
