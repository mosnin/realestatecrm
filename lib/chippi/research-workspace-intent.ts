/** Narrow routing signal for the public-web research vertical. Kept aligned
 * with the browser toolset without forcing ordinary CRM/property work into a
 * browser runtime. */
const RESEARCH_WORKSPACE_INTENT = /\b(browser|browse|website|web ?page|webpage|url|navigate|zillow|redfin|trulia|realtor\.com|search|research|look up online|compare (?:sites|sources)|find latest (?:market|listing|rate)|latest (?:market|listing|rate) data|screenshot)\b/i;

export function isResearchWorkspaceIntent(message: string): boolean {
  return RESEARCH_WORKSPACE_INTENT.test(message ?? '');
}
