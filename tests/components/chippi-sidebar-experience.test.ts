import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  chippiSidebarPanelMotion,
  defaultChippiSidebarView,
} from '@/components/dashboard/chippi-sidebar-experience';

const read = (file: string) => readFileSync(file, 'utf8');

describe('Chippi single-sidebar experience', () => {
  it('defaults only the exact chat root to conversation history', () => {
    expect(defaultChippiSidebarView('/s/acme/chippi', '/s/acme/chippi')).toBe('history');
    expect(defaultChippiSidebarView('/s/acme/chippi/brief', '/s/acme/chippi')).toBe('menu');
    expect(defaultChippiSidebarView('/broker/chippi', '/broker/chippi')).toBe('history');
    expect(defaultChippiSidebarView('/broker/deals', '/broker/chippi')).toBe('menu');
  });

  it('uses a 10px, 180ms transition and removes travel for reduced motion', () => {
    const history = chippiSidebarPanelMotion('history', false);
    const menu = chippiSidebarPanelMotion('menu', false);
    const reduced = chippiSidebarPanelMotion('history', true);

    expect(history.initial).toMatchObject({ opacity: 0, x: 10 });
    expect(menu.initial).toMatchObject({ opacity: 0, x: -10 });
    expect(history.transition.duration).toBe(0.18);
    expect(reduced.initial).toMatchObject({ opacity: 0, x: 0 });
    expect(reduced.exit).toMatchObject({ opacity: 0, x: 0 });
  });

  it('renders menu and history as exclusive views in desktop and mobile navigation', () => {
    const sidebar = read('components/dashboard/sidebar.tsx');
    const header = read('components/dashboard/header.tsx');

    expect(sidebar).toContain("renderedSidebarView === 'history' && onChippi ?");
    expect(sidebar).toContain("renderedBrokerSidebarView === 'history'");
    expect(sidebar).toContain('Back to menu');
    expect(sidebar).toContain('Conversation history');
    expect(header).toContain("isOnChatRoot && chippiSidebarView === 'history' ?");
    expect(header).toContain('CHIPPI_SIDEBAR_REVEAL_EVENT');
  });

  it('routes chat History into the shared sidebar and removes the fixed overlay', () => {
    const workspace = read('components/chippi/chippi-workspace.tsx');

    expect(workspace).toContain("requestChippiSidebarView('history', { reveal: true })");
    expect(workspace).not.toContain('ConversationSidebar');
    expect(workspace).not.toContain('fixed inset-0 z-50 flex');
    expect(workspace).not.toContain('drawerOpen');
  });

  it('bounds conversation state before rendering it in the navigation surface', () => {
    const realtorHistory = read('components/dashboard/sidebar-conversations.tsx');
    const sidebar = read('components/dashboard/sidebar.tsx');

    expect(realtorHistory).toContain('Math.min(limit, 50)');
    expect(realtorHistory).toContain('data.slice(0, boundedLimit)');
    expect(sidebar).toContain('data.slice(0, boundedLimit)');
  });
});
