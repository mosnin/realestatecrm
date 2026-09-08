// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { Building2 } from 'lucide-react';
vi.mock('next/navigation', () => ({ usePathname: () => '/s/solo/chippi/brief' }));
import { NamedWorkspaceSwitcher } from '@/components/dashboard/workspace-switcher';
import { CollaborationSection } from '@/components/settings/collaboration-section';
vi.mock('next/link', () => ({ default: ({ children, ...props }: any) => React.createElement('a', props, children) }));
afterEach(() => vi.unstubAllGlobals());
it('keeps a solo identity static and reveals switching after joining a team', async () => {
  vi.stubGlobal('React', React); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const element = document.createElement('div'); const root = createRoot(element);
  const props = { currentName: 'Alex Morgan', currentSubtitle: 'Agent workspace', currentIcon: Building2, slug: 'solo', spaceName: 'Alex Morgan', brokerageMemberships: [], isOnBrokerPage: false };
  await act(async () => root.render(React.createElement(NamedWorkspaceSwitcher, props)));
  expect(element.textContent).toBe('Alex Morgan');
  expect(element.querySelector('button')).toBeNull();
  expect(element.querySelector('a')).toBeNull();
  await act(async () => root.render(React.createElement(NamedWorkspaceSwitcher, { ...props, teams: [{ id: 'team-a', name: 'Harbor', role: 'member' }] })));
  expect(element.querySelector('button')?.getAttribute('aria-label')).toContain('Switch workspace');
  await act(async () => root.unmount());
});
it('keeps creation in settings with explicit form destinations and respects feature availability', async () => {
  vi.stubGlobal('React', React); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const element = document.createElement('div'); const root = createRoot(element);
  await act(async () => root.render(React.createElement(CollaborationSection, { teamsEnabled: true })));
  expect(element.querySelector('a[href="/teams?mode=create"]')).not.toBeNull();
  expect(element.querySelector('a[href="/teams?mode=join"]')).not.toBeNull();
  await act(async () => root.render(React.createElement(CollaborationSection, { teamsEnabled: false })));
  expect(element.querySelector('a[href^="/teams"]')).toBeNull();
  expect(element.querySelector('a[href="/brokerage"]')).not.toBeNull();
  await act(async () => root.unmount());
});
