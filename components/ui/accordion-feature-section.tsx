"use client";

/**
 * Feature197 — the provided accordion feature section, tailored to Chippi
 * (broker-floor features) and animated: the preview image cross-fades on
 * accordion change. Images stay the provided placeholder SVGs until real
 * screenshots land (per direction).
 */

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

interface FeatureItem {
  id: number;
  title: string;
  image: string;
  description: string;
}

interface Feature197Props {
  features?: FeatureItem[];
}

const defaultFeatures: FeatureItem[] = [
  {
    id: 1,
    title: "Lead routing that thinks",
    image: "https://shadcnblocks.com/images/block/placeholder-1.svg",
    description:
      "Every lead lands with the right agent — auto-assigned by territory and load, or hand-picked with a brief. Chippi logs the assignment and the reason to the activity trail, so routing decisions are never a mystery.",
  },
  {
    id: 2,
    title: "The floor, on one leaderboard",
    image: "https://shadcnblocks.com/images/block/placeholder-2.svg",
    description:
      "Deals active, won, and lost; response times; pipeline value — pulled from the real work, not a status meeting. Ask Chippi to roll up any realtor's week and the numbers come back with names attached.",
  },
  {
    id: 3,
    title: "Per-deal team chat",
    image: "https://shadcnblocks.com/images/block/placeholder-3.svg",
    description:
      "Channels that live with the deal, not next to it. Mention @chippi and it answers in line — where the deal stands, a drafted reply, a number pulled from the record. Archived automatically on close.",
  },
  {
    id: 4,
    title: "Bottlenecks, surfaced",
    image: "https://shadcnblocks.com/images/block/placeholder-4.svg",
    description:
      "Stalled deals, overdue follow-ups, hot leads going cold — Chippi reads the floor's real activity and lifts what needs attention before it costs a closing. You decide the move; it does the digging.",
  },
  {
    id: 5,
    title: "Three roles, no permissions maze",
    image: "https://shadcnblocks.com/images/block/placeholder-5.svg",
    description:
      "Owner runs the show, Admin manages the floor, Member does the work. Aggregate metrics are team-visible; private drafts and notes stay private. Invite by link with the role pre-set.",
  },
];

const Feature197 = ({ features = defaultFeatures }: Feature197Props) => {
  const [activeTabId, setActiveTabId] = useState<number | null>(1);
  const [activeImage, setActiveImage] = useState(features[0].image);

  return (
    <section className="py-24 sm:py-32">
      <div className="container mx-auto px-6">
        <div className="mb-12 flex w-full items-start justify-between gap-12">
          <div className="w-full md:w-1/2">
            <Accordion type="single" className="w-full" defaultValue="item-1">
              {features.map((tab) => (
                <AccordionItem key={tab.id} value={`item-${tab.id}`}>
                  <AccordionTrigger
                    onClick={() => {
                      setActiveImage(tab.image);
                      setActiveTabId(tab.id);
                    }}
                    className="cursor-pointer py-5 !no-underline transition"
                  >
                    <h6
                      className={`text-xl font-semibold ${tab.id === activeTabId ? "text-foreground" : "text-muted-foreground"}`}
                    >
                      {tab.title}
                    </h6>
                  </AccordionTrigger>
                  <AccordionContent>
                    <p className="mt-3 text-muted-foreground">
                      {tab.description}
                    </p>
                    <div className="mt-4 md:hidden">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={tab.image}
                        alt={tab.title}
                        className="h-full max-h-80 w-full rounded-md object-cover"
                      />
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
          <div className="relative m-auto hidden w-1/2 overflow-hidden rounded-xl bg-muted md:block">
            <AnimatePresence mode="wait">
              <motion.img
                key={activeImage}
                src={activeImage}
                alt="Feature preview"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.01 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
                className="aspect-[4/3] rounded-md object-cover pl-4"
              />
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
};

export { Feature197 };
