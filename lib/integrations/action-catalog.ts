/**
 * Curated Composio action slugs per toolkit — the surface for the
 * "Call a connected app" action picker in the workflow builder.
 *
 * Slugs verified against Composio's published catalog. Only include
 * actions that make sense in a real estate workflow context. A realtor
 * should never need to type a raw Composio slug.
 */

export interface CuratedAction {
  value: string;
  label: string;
}

export const CURATED_ACTIONS: Record<string, CuratedAction[]> = {
  gmail: [
    { value: 'GMAIL_SEND_EMAIL', label: 'Send an email' },
    { value: 'GMAIL_CREATE_EMAIL_DRAFT', label: 'Create email draft' },
    { value: 'GMAIL_REPLY_TO_THREAD', label: 'Reply to a thread' },
    { value: 'GMAIL_FETCH_EMAILS', label: 'Fetch recent emails' },
  ],
  outlook: [
    { value: 'MICROSOFT_OUTLOOK_SEND_EMAIL', label: 'Send an email' },
    { value: 'MICROSOFT_OUTLOOK_CREATE_DRAFT_EMAIL', label: 'Create email draft' },
    { value: 'MICROSOFT_OUTLOOK_REPLY_TO_EMAIL', label: 'Reply to an email' },
  ],
  slack: [
    { value: 'SLACK_SENDS_A_MESSAGE_TO_A_SLACK_CHANNEL', label: 'Send a channel message' },
    { value: 'SLACK_SEND_MESSAGE_TO_USER', label: 'Send a direct message' },
    { value: 'SLACK_LIST_ALL_CHANNELS', label: 'List channels' },
  ],
  discord: [
    { value: 'DISCORD_SEND_MESSAGE', label: 'Send a message' },
  ],
  googlecalendar: [
    { value: 'GOOGLECALENDAR_CREATE_EVENT', label: 'Create a calendar event' },
    { value: 'GOOGLECALENDAR_UPDATE_EVENT', label: 'Update a calendar event' },
    { value: 'GOOGLECALENDAR_DELETE_EVENT', label: 'Delete a calendar event' },
    { value: 'GOOGLECALENDAR_FIND_EVENT', label: 'Find a calendar event' },
  ],
  hubspot: [
    { value: 'HUBSPOT_CREATE_CONTACT', label: 'Create a contact' },
    { value: 'HUBSPOT_UPDATE_CONTACT', label: 'Update a contact' },
    { value: 'HUBSPOT_CREATE_DEAL', label: 'Create a deal' },
    { value: 'HUBSPOT_UPDATE_DEAL', label: 'Update a deal' },
    { value: 'HUBSPOT_CREATE_NOTE', label: 'Add a note' },
    { value: 'HUBSPOT_CREATE_TASK', label: 'Create a task' },
  ],
  salesforce: [
    { value: 'SALESFORCE_CREATE_LEAD', label: 'Create a lead' },
    { value: 'SALESFORCE_UPDATE_LEAD', label: 'Update a lead' },
    { value: 'SALESFORCE_CREATE_OPPORTUNITY', label: 'Create an opportunity' },
    { value: 'SALESFORCE_CREATE_TASK', label: 'Create a task' },
    { value: 'SALESFORCE_CREATE_NOTE', label: 'Add a note' },
  ],
  notion: [
    { value: 'NOTION_CREATE_PAGE', label: 'Create a page' },
    { value: 'NOTION_UPDATE_PAGE', label: 'Update a page' },
    { value: 'NOTION_ADD_PAGE_CONTENT', label: 'Add content to a page' },
  ],
  airtable: [
    { value: 'AIRTABLE_CREATE_RECORD', label: 'Create a record' },
    { value: 'AIRTABLE_UPDATE_RECORD', label: 'Update a record' },
    { value: 'AIRTABLE_LIST_RECORDS', label: 'List records' },
  ],
  twilio: [
    { value: 'TWILIO_SEND_SMS', label: 'Send an SMS' },
    { value: 'TWILIO_MAKE_CALL', label: 'Make a phone call' },
  ],
  zoom: [
    { value: 'ZOOM_CREATE_MEETING', label: 'Create a meeting' },
    { value: 'ZOOM_UPDATE_MEETING', label: 'Update a meeting' },
    { value: 'ZOOM_DELETE_MEETING', label: 'Delete a meeting' },
  ],
  asana: [
    { value: 'ASANA_CREATE_TASK', label: 'Create a task' },
    { value: 'ASANA_UPDATE_TASK', label: 'Update a task' },
    { value: 'ASANA_CREATE_PROJECT', label: 'Create a project' },
  ],
  linear: [
    { value: 'LINEAR_CREATE_ISSUE', label: 'Create an issue' },
    { value: 'LINEAR_UPDATE_ISSUE', label: 'Update an issue' },
  ],
};
