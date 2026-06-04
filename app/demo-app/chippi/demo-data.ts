/**
 * Hardcoded demo data for /demo-app/chippi.
 *
 * This file exists so the demo Chippi home can render the REAL
 * ChippiWorkspace component with a fully-formed "morning replay"
 * conversation, without ever touching auth, Supabase, or any API. The
 * shapes here mirror exactly what app/s/[slug]/chippi/page.tsx loads from
 * the database, so the workspace renders pixel-identically to production.
 *
 * Persona: realtor Jordan Rivera, business Rivera Residential, slug rivera.
 * Nothing in here makes a network call; clicking deeper (expand a card,
 * send a message) simply no-ops or fails silently, which is fine for a demo.
 */

import type { Conversation } from '@/lib/types';
import type { MessageBlock } from '@/lib/ai-tools/blocks';

export const DEMO_SLUG = 'rivera';

export const DEMO_CONVERSATION_ID = 'demo-morning-replay';

/**
 * Sidebar history. Most-recent first, matching the server's
 * `order('updatedAt', { ascending: false })`.
 */
export const DEMO_CONVERSATIONS: Conversation[] = [
  {
    id: DEMO_CONVERSATION_ID,
    spaceId: 'demo-space',
    title: 'This morning',
    createdAt: new Date('2026-06-04T07:10:00'),
    updatedAt: new Date('2026-06-04T07:12:00'),
    preview: 'Scored three leads, drafted two replies, booked a tour.',
  },
  {
    id: 'demo-conv-pipeline',
    spaceId: 'demo-space',
    title: 'Pipeline check',
    createdAt: new Date('2026-06-03T16:40:00'),
    updatedAt: new Date('2026-06-03T16:44:00'),
    preview: 'Four deals need a nudge before Friday.',
  },
  {
    id: 'demo-conv-priya',
    spaceId: 'demo-space',
    title: 'Priya Patel follow-up',
    createdAt: new Date('2026-06-03T09:05:00'),
    updatedAt: new Date('2026-06-03T09:08:00'),
    preview: 'Drafted a reply about the Oak Street listing.',
  },
];

/**
 * The morning-replay transcript. A single user turn followed by one rich
 * assistant turn whose blocks render the work Chippi already did overnight:
 * scored leads (search_contacts → ContactsResult), a drafted reply
 * (draft_email), and a booked tour (schedule_tour → ToursResult). The final
 * completed tool is schedule_tour, so ChippiWorkspace surfaces its curated
 * suggestion chips automatically.
 */
export const DEMO_MESSAGES: {
  role: 'user' | 'assistant';
  content: string;
  blocks?: MessageBlock[] | null;
}[] = [
  {
    role: 'user',
    content: 'Morning. What did you get done while I was asleep?',
    blocks: [
      {
        type: 'text',
        content: 'Morning. What did you get done while I was asleep?',
      },
    ],
  },
  {
    role: 'assistant',
    content: '',
    blocks: [
      {
        type: 'text',
        content:
          "Good morning, Jordan. Quiet night, productive one. I scored three new leads, drafted two replies for your review, and booked a tour for Sarah Chen. Here's the rundown.",
      },
      {
        type: 'tool_call',
        callId: 'demo-call-score',
        name: 'search_contacts',
        args: { query: 'new leads overnight' },
        status: 'complete',
        display: 'contacts',
        result: {
          ok: true,
          summary: 'Scored 3 new leads from last night.',
          data: {
            contacts: [
              {
                id: 'demo-contact-sarah',
                name: 'Sarah Chen',
                email: 'sarah.chen@example.com',
                phone: null,
                leadType: 'buyer',
                scoreLabel: 'hot',
                leadScore: 91,
              },
              {
                id: 'demo-contact-priya',
                name: 'Priya Patel',
                email: 'priya.patel@example.com',
                phone: null,
                leadType: 'buyer',
                scoreLabel: 'hot',
                leadScore: 88,
              },
              {
                id: 'demo-contact-marcus',
                name: 'Marcus Webb',
                email: 'marcus.webb@example.com',
                phone: null,
                leadType: 'rental',
                scoreLabel: 'warm',
                leadScore: 64,
              },
            ],
          },
        },
      },
      {
        type: 'text',
        content:
          'Sarah and Priya both came in through the Oak Street listing and read as ready to move. Marcus is earlier, worth a warm touch this week.',
      },
      {
        type: 'tool_call',
        callId: 'demo-call-draft',
        name: 'draft_email',
        args: {
          name: 'Priya Patel',
          subject: 'The Oak Street place you asked about',
        },
        status: 'complete',
        display: 'success',
        result: {
          ok: true,
          summary:
            'Drafted a reply to Priya Patel about the Oak Street listing. Waiting for your review before it goes out.',
        },
      },
      {
        type: 'text',
        content:
          'I drafted a reply to Priya and a gentle check-in for Emily Carter. Both are sitting in your drafts, ready for a glance and a send. I did not send anything on my own.',
      },
      {
        type: 'tool_call',
        callId: 'demo-call-tour',
        name: 'schedule_tour',
        args: {
          name: 'Sarah Chen',
          subject: 'Tour at 412 Oak Street',
        },
        status: 'complete',
        display: 'tours',
        result: {
          ok: true,
          summary: 'Booked a tour for Sarah Chen at 412 Oak Street.',
          data: {
            tours: [
              {
                tourId: 'demo-tour-sarah',
                startsAt: '2026-06-04T15:00:00',
                endsAt: '2026-06-04T16:00:00',
                contactId: 'demo-contact-sarah',
                guestName: 'Sarah Chen',
                propertyAddress: '412 Oak Street',
                status: 'confirmed',
              },
            ],
          },
        },
      },
      {
        type: 'text',
        content:
          'Sarah confirmed for 3:00 PM today at 412 Oak Street. That is the one to win. Want me to send her a confirmation and block prep time before it?',
      },
    ],
  },
];
