/**
 * Hardcoded dummy data for the backend-free /demo-app/inbox surface.
 *
 * Mirrors the prop shape the real Email tab feeds its rows:
 *   - DemoEmailItem matches the `EmailListItem` type inside
 *     components/communication/email-inbox-view.tsx (id, threadId, from/to,
 *     subject, snippet, sentAt, unread, starred).
 *
 * No backend: this array stands in for the /api/email fetch the real
 * EmailInboxView runs. Email only - this product is an inbox, not SMS or
 * calls. Realtor is Jordan Rivera of Rivera Residential.
 *
 * One extra field beyond the real shape: `chippiDraft`. The top thread
 * carries a reply Chippi already wrote, sitting ready for review before
 * Jordan even opens the email. That is the whole point of the surface,
 * so the demo shows it inline on the row.
 */

export type DemoEmailItem = {
  id: string;
  threadId: string;
  fromName: string;
  fromAddress: string;
  toName: string;
  toAddress: string;
  subject: string | null;
  snippet: string;
  sentAt: string;
  unread: boolean;
  starred: boolean;
  /** When set, Chippi has a reply staged for this thread, awaiting review. */
  chippiDraft?: {
    subject: string;
    body: string;
  };
};

// Anchored to the project "today" (2026-06-04) so relative times stay stable.
const NOW = new Date('2026-06-04T12:00:00Z');
function minutesAgo(n: number): string {
  return new Date(NOW.getTime() - n * 60_000).toISOString();
}
function hoursAgo(n: number): string {
  return new Date(NOW.getTime() - n * 3_600_000).toISOString();
}
function daysAgo(n: number): string {
  return new Date(NOW.getTime() - n * 86_400_000).toISOString();
}

const JORDAN = { name: 'Jordan Rivera', address: 'jordan@riveraresidential.com' };

export const DEMO_INBOX: DemoEmailItem[] = [
  {
    id: 'm-sarah-1',
    threadId: 't-sarah',
    fromName: 'Sarah Chen',
    fromAddress: 'sarah.chen@gmail.com',
    toName: JORDAN.name,
    toAddress: JORDAN.address,
    subject: 'Saturday showing for 412 Linden Ave?',
    snippet:
      'Hi Jordan, we loved the photos. Could we see 412 Linden this Saturday afternoon? Anytime after 1 works for us.',
    sentAt: minutesAgo(18),
    unread: true,
    starred: false,
    chippiDraft: {
      subject: 'Re: Saturday showing for 412 Linden Ave?',
      body:
        'Hi Sarah,\n\nSaturday works beautifully. I have 412 Linden Ave open at 2:00pm, which gives us plenty of daylight to see the backyard and the natural light in the kitchen at its best.\n\nI will hold the slot for you. If 2:00 runs tight, 3:30 is also free. Just reply with whichever you prefer and I will send a calendar invite with the address and parking notes.\n\nLooking forward to it,\nJordan Rivera\nRivera Residential',
    },
  },
  {
    id: 'm-priya-1',
    threadId: 't-priya',
    fromName: 'Priya Patel',
    fromAddress: 'priya.patel@outlook.com',
    toName: JORDAN.name,
    toAddress: JORDAN.address,
    subject: 'Rental application documents attached',
    snippet:
      'Attaching the completed application, two pay stubs, and the reference letter for the Maple Street unit. Happy to send anything else you need.',
    sentAt: hoursAgo(3),
    unread: true,
    starred: true,
  },
  {
    id: 'm-marcus-1',
    threadId: 't-marcus',
    fromName: 'Marcus Webb',
    fromAddress: 'marcus.webb@gmail.com',
    toName: JORDAN.name,
    toAddress: JORDAN.address,
    subject: 'Any new listings in the Highland school zone?',
    snippet:
      'We are flexible on move-in but firm on the school zone. Three bedrooms ideally, under 650k. Anything coming up that fits?',
    sentAt: hoursAgo(7),
    unread: false,
    starred: false,
  },
  {
    id: 'm-emily-1',
    threadId: 't-emily',
    fromName: 'Emily Carter',
    fromAddress: 'emily.carter@gmail.com',
    toName: JORDAN.name,
    toAddress: JORDAN.address,
    subject: 'Thank you for the tour yesterday',
    snippet:
      'The condo on Rosewood was lovely. We are talking it over tonight and will let you know about a second viewing by tomorrow.',
    sentAt: daysAgo(1),
    unread: false,
    starred: false,
  },
  {
    id: 'm-diego-1',
    threadId: 't-diego',
    fromName: 'Diego Romero',
    fromAddress: 'diego.romero@outlook.com',
    toName: JORDAN.name,
    toAddress: JORDAN.address,
    subject: 'Offer accepted on 88 Foster Lane',
    snippet:
      'Great news, the sellers accepted. What are the next steps on inspection and closing timeline? Want to keep things moving.',
    sentAt: daysAgo(2),
    unread: false,
    starred: true,
  },
];
