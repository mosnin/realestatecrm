import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { BrokerMain } from "@/components/broker/broker-main";
vi.stubGlobal("React", React);
vi.mock("next/navigation", () => ({ usePathname: () => "/broker/deals" }));

const read = (path: string) => readFileSync(path, "utf8");

const canonicalBrokerPages = [
  "activity",
  "agent-activity",
  "analytics",
  "billing",
  "brief",
  "commissions",
  "deals",
  "floor",
  "forecast",
  "import-export",
  "integrations",
  "invitations",
  "leaderboard",
  "leads",
  "members",
  "messages",
  "my-leads",
  "people",
  "pipeline",
  "profitability",
  "properties",
  "realtors",
  "realtors/[userId]",
  "reviews",
  "reviews/[id]",
  "routines",
  "settings",
  "settings/auto-assignment",
  "settings/form-builder",
  "settings/mcp",
  "settings/profile",
  "settings/routing-rules",
  "templates",
  "usage",
] as const;

const brokerStateFiles = [
  "deals/error.tsx",
  "deals/loading.tsx",
  "forecast/error.tsx",
  "forecast/loading.tsx",
  "integrations/error.tsx",
  "integrations/loading.tsx",
  "members/loading.tsx",
  "people/error.tsx",
  "people/loading.tsx",
  "properties/error.tsx",
  "properties/loading.tsx",
  "realtors/error.tsx",
  "realtors/loading.tsx",
  "usage/error.tsx",
  "usage/loading.tsx",
] as const;

describe("broker premium dashboard contract", () => {
  it("puts every canonical brokerage page inside the premium page system", () => {
    for (const route of canonicalBrokerPages) {
      expect(read(`app/broker/${route}/page.tsx`), route).toContain(
        "data-broker-premium-page",
      );
    }
  });

  it("renders existing brokerage content inside its dashboard canvas", () => {
    const html = renderToStaticMarkup(
      React.createElement(BrokerMain, {
        children: React.createElement(
          "a",
          { href: "/broker/deals/real-deal" },
          "Existing deal",
        ),
      }),
    );
    expect(html).toContain("data-premium-dashboard");
    expect(html).toContain("chippi-dashboard-canvas");
    expect(html).toContain('href="/broker/deals/real-deal"');
    expect(html).toContain("Existing deal");
  });

  it("keeps loading and error boundaries in the same premium system", () => {
    for (const file of brokerStateFiles) {
      expect(read(`app/broker/${file}`), file).toContain(
        "data-broker-premium-state",
      );
    }
  });

  it("opens an ID-bound brokerage record without requiring chat", async () => {
    const { BrokerRecordDetail } = await import('@/components/broker/record-detail');
    const html = renderToStaticMarkup(React.createElement(BrokerRecordDetail, { title: 'Buyer record', back: '/broker/people', fields: [{label:'Follow-up',value:'Due today'}] }));
    expect(html).toContain('Buyer record');
    expect(html).toContain('Due today');
    expect(html).toContain('href="/broker/people"');
  });
});
