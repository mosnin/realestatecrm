import type { Metadata } from 'next';
import { CalendarView } from './calendar-view';
import { PAGE_RHYTHM } from '@/lib/typography';

export const metadata: Metadata = { title: 'Calendar — Demo' };

/**
 * /demo-app/calendar — backend-free clone of /s/[slug]/calendar.
 *
 * The real page does a server pass (slug → space → calendar connection) before
 * rendering CalendarView. Here there's no backend: the view is always
 * "connected" and reads hardcoded events anchored to the current week. No
 * auth, no Supabase, no fetch.
 */
export default function DemoCalendarPage() {
  return (
    <div className={PAGE_RHYTHM}>
      <CalendarView />
    </div>
  );
}
