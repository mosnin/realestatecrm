"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import {
  Building2,
  Home,
  Moon,
  Sun,
  Search,
  History,
  CreditCard,
  Gift,
  LifeBuoy,
} from "lucide-react";
import { SicariiShell, type SicariiNavItem } from "./shell";
import {
  realtorNavItems,
  secondaryNavItems,
  type NavItem,
} from "@/lib/nav-items";
import {
  brokerAdminNavSections,
  brokerMemberNavSections,
  WorkspaceSwitcher,
  BrokerSidebarConversations,
} from "@/components/dashboard/sidebar";
import { NotificationCenter } from "@/components/dashboard/notification-center";
import { NotificationBell } from "@/components/broker/notification-bell";
import { ShareLinksMenu } from "@/components/dashboard/share-links-menu";
import { useTheme } from "@/components/theme-provider";

import { SidebarConversations } from "@/components/dashboard/sidebar-conversations";
import { CHIPPI_SIDEBAR_REVEAL_EVENT } from "@/components/dashboard/chippi-sidebar-experience";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

function ConversationHistory({
  slug,
  broker,
}: {
  slug: string;
  broker: boolean;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const reveal = () => setOpen(true);
    window.addEventListener(CHIPPI_SIDEBAR_REVEAL_EVENT, reveal);
    return () =>
      window.removeEventListener(CHIPPI_SIDEBAR_REVEAL_EVENT, reveal);
  }, []);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          aria-label="Conversation history"
          className="sicarii-utility"
        >
          <History size={17} />
        </button>
      </SheetTrigger>
      <SheetContent
        side="left"
        className="app-theme overflow-y-auto"
        aria-describedby={undefined}
      >
        <SheetHeader>
          <SheetTitle>Conversation history</SheetTitle>
        </SheetHeader>
        <div className="px-3">
          {broker ? (
            <BrokerSidebarConversations
              limit={50}
              hideLabel
              onSelect={() => setOpen(false)}
            />
          ) : (
            <SidebarConversations
              slug={slug}
              limit={50}
              hideLabel
              onSelect={() => setOpen(false)}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

interface Props {
  slug: string;
  spaceId?: string;
  spaceName: string;
  isBroker?: boolean;
  brokerageRole?: string | null;
  brokerageMemberships?: { id: string; name: string; role: string }[];
  isPlatformAdmin?: boolean;
  children: React.ReactNode;
}
export function WorkspaceShell({
  slug,
  spaceId,
  spaceName,
  isBroker = false,
  brokerageRole,
  brokerageMemberships = [],
  isPlatformAdmin,
  children,
}: Props) {
  const pathname = usePathname() ?? "";
  const broker = pathname.startsWith("/broker");
  const base = broker ? "" : `/s/${slug}`;
  const { theme, toggleTheme } = useTheme();
  const brokerAdmin = ["broker_owner", "broker_admin"].includes(
    brokerageRole ?? "",
  );
  const catalog: NavItem[] = broker
    ? (brokerAdmin ? brokerAdminNavSections : brokerMemberNavSections)
        .flatMap((s) => s.items)
        .filter((i) => !i.adminOnly || brokerAdmin)
    : [...realtorNavItems, ...secondaryNavItems];
  const allItems: SicariiNavItem[] = [];
  for (const item of catalog) {
    const href = `${base}${item.href}`;
    if (!allItems.some((i) => i.href === href))
      allItems.push({
        ...item,
        href,
        description: `Open ${item.label.toLowerCase()}`,
        excludePaths:
          "excludePaths" in item
            ? item.excludePaths?.map((p) => `${base}${p}`)
            : undefined,
      });
    if ("children" in item)
      for (const child of item.children ?? []) {
        const childHref = `${base}${child.href}`;
        if (!allItems.some((i) => i.href === childHref))
          allItems.push({
            ...child,
            href: childHref,
            label: `${item.label} · ${child.label}`,
            icon: item.icon,
            description: child.label,
          });
      }
  }
  if (!broker)
    allItems.push(
      {
        href: `${base}/affiliate`,
        label: "Affiliate",
        icon: Gift,
        description: "Referral program",
      },
      {
        href: `${base}/billing`,
        label: "Plans and billing",
        icon: CreditCard,
        description: "Manage your subscription",
      },
      {
        href: `${base}/support`,
        label: "Help",
        icon: LifeBuoy,
        description: "Support tickets",
      },
    );
  if (!broker)
    allItems.push({
      href: `${base}/follow-through`,
      label: "Client follow-through",
      icon: Home,
      description: "Dated commitments and human handoffs",
    });
  if (isBroker && !broker)
    allItems.push({
      href: "/broker",
      label: "Brokerage",
      icon: Building2,
      description: "Team workspace",
    });
  if (isPlatformAdmin)
    allItems.push({
      href: "/admin",
      label: "Administration",
      icon: Building2,
      description: "Platform administration",
    });
  const primaryPaths = broker
    ? brokerAdmin
      ? [
          "/broker/brief",
          "/broker/chippi",
          "/broker/leads",
          "/broker/deals",
          "/broker/realtors",
          "/broker/properties",
        ]
      : [
          "/broker/brief",
          "/broker/my-leads",
          "/broker/templates",
          "/broker/leaderboard",
        ]
    : [
        "/chippi/brief",
        "/chippi",
        "/contacts",
        "/deals",
        "/calendar",
        "/communication",
        "/properties",
      ].map((p) => `${base}${p}`);
  const items = primaryPaths.flatMap((href) => {
    const item = allItems.find((i) => i.href === href);
    return item ? [item] : [];
  });
  const home = broker ? "/broker/brief" : `${base}/chippi/brief`;
  const utilities = (
    <>
      <ConversationHistory slug={slug} broker={broker} />
      <div className="sicarii-workspace max-w-44 min-w-0">
        <WorkspaceSwitcher
          currentName={spaceName}
          currentSubtitle={broker ? "Brokerage" : "Workspace"}
          currentIcon={broker ? Building2 : Home}
          slug={slug}
          spaceName={spaceName}
          brokerageMemberships={brokerageMemberships}
          isOnBrokerPage={broker}
        />
      </div>
      {!broker && (
        <button
          type="button"
          aria-label="Search workspace"
          className="sicarii-utility"
          onClick={() =>
            window.dispatchEvent(
              new KeyboardEvent("keydown", {
                key: "k",
                metaKey: true,
                bubbles: true,
              }),
            )
          }
        >
          <Search size={17} />
        </button>
      )}
      {broker ? (
        <NotificationBell />
      ) : (
        <>
          <NotificationCenter slug={slug} spaceId={spaceId} />
          <ShareLinksMenu slug={slug} />
        </>
      )}
      <button
        type="button"
        className="sicarii-utility"
        aria-label={theme === "dark" ? "Use light theme" : "Use dark theme"}
        onClick={toggleTheme}
      >
        {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
      </button>
      <UserButton />
    </>
  );
  return (
    <SicariiShell
      items={items}
      allItems={allItems}
      home={home}
      utilities={utilities}
    >
      {children}
    </SicariiShell>
  );
}
