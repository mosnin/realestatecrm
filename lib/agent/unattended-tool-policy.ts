import type { ToolDefinition } from '@/lib/ai-tools/types';

/**
 * Capabilities allowed in an unattended research/work-session run.
 *
 * This is deliberately an allowlist of concrete tool ids, not a negative
 * filter such as `requiresApproval === false`. Approval metadata describes
 * the interactive UX; it is not a side-effect boundary. Adding a new tool to
 * the registry never grants it unattended access.
 */
export const UNATTENDED_READ_TOOL_NAMES = [
  'find_person',
  'list_contacts',
  'find_deal',
  'find_tours',
  'find_property',
  'research_area',
  'find_comparable_properties',
  'check_availability',
  'propose_tour_times',
  'pipeline_summary',
  'workspace_stats',
  'find_stuck_deals',
  'find_quiet_hot_persons',
  'find_overdue_followups',
  'get_weather',
  'get_recent_events',
  'summarize_realtor',
  'analyze_realtor',
  'recall_history',
  'read_attachment',
  'list_files',
  'read_file',
  'read_spreadsheet',
  'summarize_document',
] as const;

export type UnattendedReadToolName = (typeof UNATTENDED_READ_TOOL_NAMES)[number];

const ALLOWED = new Set<string>(UNATTENDED_READ_TOOL_NAMES);

export function unattendedReadTools(registry: readonly ToolDefinition[]): ToolDefinition[] {
  const byName = new Map(registry.map((tool) => [tool.name, tool]));
  const missing = UNATTENDED_READ_TOOL_NAMES.filter((name) => !byName.has(name));
  if (missing.length > 0) {
    throw new Error(`Unattended tool policy references missing tools: ${missing.join(', ')}`);
  }

  return registry.filter((tool) => {
    if (!ALLOWED.has(tool.name)) return false;
    if (tool.requiresApproval !== false || (tool.riskLevel ?? 'safe') !== 'safe') {
      throw new Error(`Unattended tool policy contains non-read tool: ${tool.name}`);
    }
    return true;
  });
}

export function isUnattendedReadTool(name: string): name is UnattendedReadToolName {
  return ALLOWED.has(name);
}
