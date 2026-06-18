/**
 * Modal-path forwarding test — the live-chat fix.
 *
 * The live realtor chat runs through Modal (Python). For a tool result to
 * render as a rich card, `display` + `data` must survive every hop:
 *
 *   Python find_contacts  → {display:"contacts", contacts:[...]}
 *   modal_app.translate   → SSE frame carries display + data
 *   route.ts (HERE)       → mapModalToolResultFrame forwards display + data
 *                           onto the browser tool_call_result frame
 *   client use-agent-task → block.display + block.result.data
 *   tool-call-block-view  → ContactsTableResult / DataTable
 *
 * The previous tool-ui attempt wired the renderer and the in-process TS path
 * but DROPPED display/data on the Modal hop, so the live chat always fell back
 * to a prose dump. This test pins the route.ts hop: the Modal `tool_call_result`
 * mapping MUST forward display + data. It also runs the forwarded contacts
 * payload through the real DataTable mapper + schema validator to prove the
 * shape the Python tool emits actually renders.
 */

import { describe, it, expect } from 'vitest';
import { mapModalToolResultFrame } from '@/lib/ai-tools/modal-frame';
import { buildContactsTable } from '@/components/ai/blocks/tool-results/tool-ui-mappers';
import { safeParseSerializableDataTable } from '@/components/tool-ui/data-table/schema';
import { normalizeDealRows, normalizePropertyRows } from '@/components/ai/blocks/tool-results/normalize';

describe('mapModalToolResultFrame — Modal → browser tool_call_result', () => {
  it('forwards display + data for CONTACTS (the must-prove live path)', () => {
    // Exactly what agent/tools/contacts.find_contacts emits, after
    // modal_app.translate lifts it onto the SSE frame as `display` + `data`.
    const modalEvent = {
      type: 'tool_call_result',
      tool: 'find_contacts',
      call_id: 'call_abc',
      ok: true,
      summary: 'Found 2 contacts.',
      display: 'contacts',
      data: {
        contacts: [
          {
            id: 'c1',
            name: 'Orlando Miller',
            email: 'orlando@example.com',
            phone: '555-0100',
            leadType: 'buyer',
            leadScore: 82,
            scoreLabel: 'hot',
            followUpAt: null,
            lastContactedAt: '2026-06-10T12:00:00Z',
          },
        ],
        count: 1,
        display: 'contacts',
      },
    };

    const frame = mapModalToolResultFrame(modalEvent);

    // The load-bearing assertions: display + data reached the browser frame.
    expect(frame.type).toBe('tool_call_result');
    expect(frame.name).toBe('find_contacts');
    expect(frame.callId).toBe('call_abc');
    expect(frame.ok).toBe(true);
    expect(frame.display).toBe('contacts');
    expect(frame.data).toBeDefined();
    const data = frame.data as { contacts: unknown[] };
    expect(Array.isArray(data.contacts)).toBe(true);
    expect(data.contacts).toHaveLength(1);

    // End-to-end shape proof: the forwarded contacts payload renders — it
    // passes the DataTable mapper + schema validator the renderer uses.
    const rows = (frame.data as { contacts: Parameters<typeof buildContactsTable>[0] })
      .contacts;
    const table = buildContactsTable(rows);
    const parsed = safeParseSerializableDataTable(table);
    expect(parsed).not.toBeNull();
    // The first row carries the realtor-readable fields.
    expect(parsed!.data[0]).toMatchObject({ name: 'Orlando Miller', status: 'hot' });
  });

  it('forwards display + data for DEALS, and the shape normalizes + renders', () => {
    const frame = mapModalToolResultFrame({
      type: 'tool_call_result',
      tool: 'find_deals',
      call_id: 'call_d',
      ok: true,
      summary: 'Found 1 deal.',
      display: 'deals',
      data: {
        deals: [
          {
            id: 'd1',
            title: '123 Main St',
            stageName: 'Offer',
            status: 'active',
            value: 650000,
            contactName: 'Sam Park',
            closeDate: '2026-07-01',
          },
        ],
        count: 1,
        display: 'deals',
      },
    });

    expect(frame.display).toBe('deals');
    const deals = normalizeDealRows(frame.data);
    expect(deals).toHaveLength(1);
    expect(deals[0]).toMatchObject({ title: '123 Main St', stageName: 'Offer' });
  });

  it('forwards display + data for PROPERTIES, and the shape normalizes', () => {
    const frame = mapModalToolResultFrame({
      type: 'tool_call_result',
      tool: 'add_property',
      call_id: 'call_p',
      ok: true,
      summary: 'Added property: 14 Oak St.',
      display: 'properties',
      data: {
        properties: [{ id: 'p1', address: '14 Oak St', listPrice: 825000, beds: 3, baths: 2 }],
        display: 'properties',
      },
    });

    expect(frame.display).toBe('properties');
    const properties = normalizePropertyRows(frame.data);
    expect(properties).toHaveLength(1);
    expect(properties[0]).toMatchObject({ address: '14 Oak St', listPrice: 825000 });
  });

  it('omits display + data for a plain tool result (no rich card)', () => {
    const frame = mapModalToolResultFrame({
      type: 'tool_call_result',
      tool: 'update_contact',
      call_id: 'call_x',
      ok: true,
      summary: 'Updated.',
      // no display, no data
    });

    expect(frame.summary).toBe('Updated.');
    expect('display' in frame).toBe(false);
    expect('data' in frame).toBe(false);
  });

  it('maps ok:false to a failed frame while still forwarding any display', () => {
    const frame = mapModalToolResultFrame({
      type: 'tool_call_result',
      tool: 'find_contacts',
      call_id: 'call_e',
      ok: false,
      summary: 'lookup failed',
    });
    expect(frame.ok).toBe(false);
    expect(frame.callId).toBe('call_e');
  });

  it('defaults a missing call_id to empty string (older Modal deploys)', () => {
    const frame = mapModalToolResultFrame({ type: 'tool_call_result', tool: 'x', ok: true });
    expect(frame.callId).toBe('');
    expect(frame.ok).toBe(true);
  });
});
