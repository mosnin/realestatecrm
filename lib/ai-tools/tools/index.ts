/**
 * All tools known to the registry. New tools get added to this array in
 * their own Phase 2 / Phase 3 / Phase 5 commits.
 */

import type { ToolDefinition } from '../types';
import { searchContactsTool } from './search-contacts';

export const ALL_TOOLS: ToolDefinition[] = [
  searchContactsTool as ToolDefinition,
];
