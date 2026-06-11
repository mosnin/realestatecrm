"use client";

/**
 * FeatureSection — the provided looping task-list section, tailored to
 * Chippi: the loop is what happens to every CAPTURED lead (scored → drafted →
 * booked → followed up → synced), the badges speak Chippi, and the colors
 * ride the theme tokens. Reduced motion renders the list static.
 */

import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { motion, useReducedMotion } from "framer-motion";
import {
  Flame,
  PenLine,
  CalendarCheck,
  Bell,
  RefreshCw,
} from "lucide-react";

const tasks = [
  {
    title: "Lead captured, scored instantly",
    subtitle: "Hot, warm, cold — with the reason",
    icon: <Flame className="h-4 w-4 text-brand" />,
  },
  {
    title: "Reply drafted in your voice",
    subtitle: "Waiting before you open the thread",
    icon: <PenLine className="h-4 w-4 text-brand" />,
  },
  {
    title: "Tour booked from the thread",
    subtitle: "Calendar checked, confirmation sent",
    icon: <CalendarCheck className="h-4 w-4 text-brand" />,
  },
  {
    title: "Follow-up scheduled",
    subtitle: "Nudged before the lead goes cold",
    icon: <Bell className="h-4 w-4 text-brand" />,
  },
  {
    title: "Synced to your CRM",
    subtitle: "Written back wherever you work",
    icon: <RefreshCw className="h-4 w-4 text-brand" />,
  },
];

export default function FeatureSection() {
  const reduce = useReducedMotion();
  return (
    <section className="relative w-full bg-background px-4 py-20 text-foreground">
      <div className="mx-auto grid max-w-5xl grid-cols-1 items-center gap-12 md:grid-cols-2">
        {/* LEFT SIDE - Task Loop */}
        <div className="relative w-full max-w-sm">
          <Card className="overflow-hidden rounded-xl border-border/70 bg-muted/20 shadow-none">
            <CardContent className="relative h-[320px] overflow-hidden p-0">
              <div className="relative h-full overflow-hidden">
                <motion.div
                  className="absolute flex w-full flex-col gap-2"
                  animate={reduce ? undefined : { y: ["0%", "-50%"] }}
                  transition={{
                    repeat: Infinity,
                    repeatType: "loop",
                    duration: 14,
                    ease: "linear",
                  }}
                >
                  {[...tasks, ...tasks].map((task, i) => (
                    <div
                      key={i}
                      className="relative flex items-center gap-3 border-b border-border/60 px-4 py-3"
                    >
                      <div className="flex flex-1 items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="h-10 w-10 rounded-xl border border-border/60 bg-brand-subtle" />
                          <div>
                            <p className="text-sm font-medium text-foreground">{task.title}</p>
                            <p className="text-xs text-muted-foreground">{task.subtitle}</p>
                          </div>
                        </div>
                        {task.icon}
                      </div>
                    </div>
                  ))}
                </motion.div>

                {/* Fade effect only inside card */}
                <div className="pointer-events-none absolute left-0 top-0 h-12 w-full bg-gradient-to-b from-background via-background/70 to-transparent" />
                <div className="pointer-events-none absolute bottom-0 left-0 h-12 w-full bg-gradient-to-t from-background via-background/70 to-transparent" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* RIGHT SIDE - Content */}
        <div className="space-y-6">
          <Badge variant="secondary" className="px-3 py-1 text-sm">
            After the capture
          </Badge>
          <h3 className="text-lg font-normal leading-relaxed text-foreground sm:text-xl lg:text-2xl">
            Every captured lead, worked automatically.{" "}
            <span className="text-sm text-muted-foreground sm:text-base lg:text-2xl">
              The form is just the front door. The moment someone lands, Chippi scores
              them, drafts the first touch in your voice, books the tour, schedules the
              follow-up, and writes it all back to your CRM — while you keep showing houses.
            </span>
          </h3>

          <div className="flex flex-wrap gap-3">
            <Badge className="px-4 py-2 text-sm">Instant scoring</Badge>
            <Badge className="px-4 py-2 text-sm">Your voice</Badge>
            <Badge className="px-4 py-2 text-sm">Approval-first</Badge>
          </div>
        </div>
      </div>
    </section>
  );
}
