import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { WorkspaceShell } from "@/components/dashboard/sicarii/workspace-shell";
import { realtorNavItems } from "@/lib/nav-items";
type SidebarEntry = {href:string;label:string;subItems?:SidebarEntry[]};
const navigation = vi.hoisted(() => ({groups:[] as {label:string;items:SidebarEntry[]}[]}));
const path = vi.hoisted(() => ({ current: "/s/oak/chippi/brief" }));
vi.mock("next/navigation", () => ({ usePathname: () => path.current }));
vi.stubGlobal("React", React);
vi.mock("@clerk/nextjs", () => ({ UserButton: () => null }));
vi.mock("@/components/theme-provider", () => ({
  useTheme: () => ({ theme: "light", toggleTheme: vi.fn() }),
}));
// Inspect the adapter's rendered destinations independently of motion/browser layout.
vi.mock("@/components/dashboard/sicarii/shell", () => ({
  SicariiShell: ({
    sidebarGroups,
    items,
    allItems,
    children,
  }: {
    sidebarGroups: {label:string;items:SidebarEntry[]}[];
    items: { href: string; label: string }[];
    allItems: { href: string; label: string }[];
    children: React.ReactNode;
  }) => {
    navigation.groups = sidebarGroups;
    return React.createElement(
      React.Fragment,
      null,
      items.map((i) =>
        React.createElement(
          "a",
          { key: i.href, href: i.href, "data-primary": true },
          i.label,
        ),
      ),
      allItems.map((i) =>
        React.createElement("a", { key: i.href, href: i.href }, i.label),
      ),
      children,
    );
  },
}));
function render(role?: string) {
  return renderToStaticMarkup(
    React.createElement(WorkspaceShell, {
      slug: "oak",
      spaceName: "Oak",
      brokerageRole: role,
      children: "Existing CRM content",
    }),
  );
}
describe("Sicarii navigation preserves Chippi features", () => {
  it("retains every existing personal destination and child feature", () => {
    path.current = "/s/oak/chippi/brief";
    const html = render();
    for (const item of realtorNavItems) {
      expect(html).toContain(`href="/s/oak${item.href}"`);
      for (const child of item.children ?? [])
        expect(html).toContain(`href="/s/oak${child.href}"`);
    }
    expect(html).toContain("Existing CRM content");
    expect(html).toContain('href="/s/oak/follow-through"');
  });
  it("keeps team administration accessible to brokerage owners", () => {
    path.current = "/broker/brief";
    const html = render("broker_owner");
    for (const href of [
      "/broker/leads",
      "/broker/realtors",
      "/broker/deals",
      "/broker/forecast",
      "/broker/billing",
    ])
      expect(html).toContain(`href="${href}"`);
  });
  it("keeps member navigation separate from administration", () => {
    path.current = "/broker/brief";
    const html = render("realtor_member");
    expect(html).toContain('href="/broker/my-leads"');
    expect(html).not.toContain('href="/broker/billing"');
    expect(html).not.toContain('href="/broker/settings/auto-assignment"');
  });
  it('groups every personal destination without duplicating top-level subpages', () => {
    path.current = '/s/oak/chippi/brief'; render();
    expect(navigation.groups.map(group=>group.label)).toEqual(['Daily work','Business','Workspace']);
    const roots=navigation.groups.flatMap(group=>group.items);
    const links=roots.flatMap(item=>[item,...(item.subItems??[])]);
    for(const item of realtorNavItems){
      expect(links.map(link=>link.href)).toContain(`/s/oak${item.href}`);
      for(const child of item.children??[])expect(links.map(link=>link.href)).toContain(`/s/oak${child.href}`);
    }
    expect(roots[0]).toMatchObject({label:'Today',href:'/s/oak/chippi/brief'});
    expect(roots.find(item=>item.label==='Chippi')?.subItems?.some(item=>item.href==='/s/oak/chippi/brief')).toBe(false);
  });
  it('gives brokerage Today its own canonical label and icon position', () => {
    path.current='/broker/brief';render('broker_owner');
    expect(navigation.groups[0].items[0]).toMatchObject({label:'Today',href:'/broker/brief'});
    const links=navigation.groups.flatMap(group=>group.items.flatMap(item=>[item,...(item.subItems??[])]));
    expect(links.filter(item=>item.href==='/broker/brief')).toHaveLength(1);
    expect(links.some(item=>item.href==='/broker/settings/auto-assignment')).toBe(true);
  });

});
