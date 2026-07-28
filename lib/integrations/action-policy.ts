/**
 * Integration actions available to unattended/voice control reads.
 *
 * Unknown actions are writes until explicitly reviewed. Verb-prefix inference
 * is intentionally forbidden: provider catalogs contain deceptively named
 * actions and can change independently of this repository.
 */
export const INTEGRATION_READ_ACTIONS = new Set([
  'GMAIL_FETCH_EMAILS',
  'GMAIL_LIST_THREADS',
  'GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID',
  'OUTLOOK_LIST_MESSAGES',
  'OUTLOOK_GET_MESSAGE',
  'GOOGLECALENDAR_EVENTS_LIST',
  'GOOGLECALENDAR_FIND_FREE_SLOTS',
  'SLACK_LIST_ALL_CHANNELS',
  'SLACK_FETCH_CONVERSATION_HISTORY',
  'SLACK_LIST_ALL_USERS',
  'SLACK_FETCH_MESSAGE_THREAD_FROM_A_CONVERSATION',
  'HUBSPOT_LIST_CONTACTS',
  'HUBSPOT_LIST_DEALS',
  'HUBSPOT_LIST_EMAILS',
  'LINKEDIN_GET_MY_INFO',
  'LINKEDIN_GET_COMPANY_INFO',
  'INSTAGRAM_GET_USER_INFO',
  'INSTAGRAM_LIST_ALL_CONVERSATIONS',
  'FACEBOOK_GET_PAGE_CONVERSATIONS',
  'TWITTER_USER_LOOKUP_ME',
  'NOTION_SEARCH_NOTION_PAGE',
  'NOTION_QUERY_DATABASE',
  'GOOGLESHEETS_VALUES_GET',
  'GOOGLESHEETS_GET_SPREADSHEET_INFO',
  'GOOGLESHEETS_BATCH_GET',
] as const);

export type IntegrationActionClass = 'read' | 'write';

export function classifyIntegrationAction(slug: string): IntegrationActionClass {
  return INTEGRATION_READ_ACTIONS.has(slug as never) ? 'read' : 'write';
}
