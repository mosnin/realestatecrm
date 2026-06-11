"use client";

/**
 * Casestudies — the provided metrics + quote section (react-countup scroll-spy
 * numbers, alternating image/quote rows), tailored to Chippi: realtor and
 * broker stories with honest workflow metrics, dashboard imagery from the
 * provided demo CDN.
 */

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { Inbox, KanbanSquare, Building2 } from "lucide-react";
import Image from "next/image";

// Avoid SSR hydration issues by loading react-countup on the client.
const CountUp = dynamic(() => import("react-countup"), { ssr: false });

/** Hook: respects user's motion preferences */
function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !("matchMedia" in window)) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    setReduced(mq.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);
  return reduced;
}

/** Utility: parse a metric like "98%", "3.8x", "$1,200+", "1.5M" */
function parseMetricValue(raw: string) {
  const value = (raw ?? "").toString().trim();
  const m = value.match(
    /^([^\d\-+]*?)\s*([\-+]?\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*([^\d\s]*)$/
  );
  if (!m) {
    return { prefix: "", end: 0, suffix: value, decimals: 0 };
  }
  const [, prefix, num, suffix] = m;
  const normalized = num.replace(/,/g, "");
  const end = parseFloat(normalized);
  const decimals = (normalized.split(".")[1]?.length ?? 0);
  return {
    prefix: prefix ?? "",
    end: isNaN(end) ? 0 : end,
    suffix: suffix ?? "",
    decimals,
  };
}

/** Small component: one animated metric */
function MetricStat({
  value,
  label,
  sub,
  duration = 1.6,
}: {
  value: string;
  label: string;
  sub?: string;
  duration?: number;
}) {
  const reduceMotion = usePrefersReducedMotion();
  const { prefix, end, suffix, decimals } = parseMetricValue(value);

  return (
    <div className="flex flex-col gap-2 p-6 text-left">
      <p
        className="text-2xl font-medium text-foreground sm:text-4xl"
        aria-label={`${label} ${value}`}
        style={{ fontFamily: 'var(--font-title)' }}
      >
        {prefix}
        {reduceMotion ? (
          <span>
            {end.toLocaleString(undefined, {
              minimumFractionDigits: decimals,
              maximumFractionDigits: decimals,
            })}
          </span>
        ) : (
          <CountUp
            end={end}
            decimals={decimals}
            duration={duration}
            separator=","
            enableScrollSpy
            scrollSpyOnce
          />
        )}
        {suffix}
      </p>
      <p className="text-left font-medium text-foreground">{label}</p>
      {sub ? <p className="text-left text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

export default function Casestudies() {
  const caseStudies = [
    {
      id: 1,
      headline: "The inbox, handled before coffee",
      quote:
        "Chippi reads every inbound overnight, scores it against live deals, and has the reply drafted in the realtor's own voice — the morning starts with decisions, not triage.",
      name: "The solo realtor",
      role: "Inbox → reply → booked tour",
      image:
        "https://pub-940ccf6255b54fa799a9b01050e6c227.r2.dev/dashboard-gradient.png",
      icon: Inbox,
      metrics: [
        { value: "2 min", label: "To first response", sub: "From inbound lead to drafted reply" },
        { value: "0", label: "Leads slipping", sub: "Every inbound scored and queued" },
      ],
    },
    {
      id: 2,
      headline: "A pipeline that updates itself",
      quote:
        "Tours, offers, and closings advance their own cards. The board reflects reality — not whatever got typed in last week — and every won/lost reason is logged in plain language.",
      name: "The producing team",
      role: "Deals → stages → outcomes",
      image:
        "https://pub-940ccf6255b54fa799a9b01050e6c227.r2.dev/dashboard-02.png",
      icon: KanbanSquare,
      metrics: [
        { value: "100%", label: "Board accuracy", sub: "Stages written from real activity" },
        { value: "6 → 1", label: "Tools replaced", sub: "CRM, inbox, calendar, files, chat, content" },
      ],
    },
    {
      id: 3,
      headline: "The whole floor on one surface",
      quote:
        "Leads route by territory and load, the leaderboard pulls from real work, and stalled deals surface themselves. Brokers see the room without running a status meeting.",
      name: "The brokerage",
      role: "Routing → performance → bottlenecks",
      image:
        "https://pub-940ccf6255b54fa799a9b01050e6c227.r2.dev/featured-01.png",
      icon: Building2,
      metrics: [
        { value: "30 sec", label: "To route a lead", sub: "Auto-assigned, reason logged" },
        { value: "24/7", label: "Floor coverage", sub: "Chippi works while the floor sleeps" },
      ],
    },
  ];

  return (
    <section className="bg-background py-24 sm:py-32" aria-labelledby="case-studies-heading">
      <div className="container mx-auto px-6">
        {/* Header */}
        <div className="mx-auto flex max-w-2xl flex-col gap-4 text-center">
          <h2
            id="case-studies-heading"
            className="text-4xl font-semibold text-foreground md:text-5xl"
            style={{ fontFamily: 'var(--font-title)' }}
          >
            Real workflows, run by Chippi
          </h2>
          <p className="text-muted-foreground">
            From the solo realtor&apos;s inbox to the brokerage floor — the same agent,
            doing the work end to end.
          </p>
        </div>

        {/* Cases */}
        <div className="mt-20 flex flex-col gap-20">
          {caseStudies.map((study, idx) => {
            const reversed = idx % 2 === 1;
            return (
              <div
                key={study.id}
                className="grid items-center gap-12 border-b border-border/60 pb-12 lg:grid-cols-3 xl:gap-24"
              >
                {/* Left: Image + Quote */}
                <div
                  className={[
                    "flex flex-col gap-10 text-left sm:flex-row lg:col-span-2 lg:border-r lg:pr-12 xl:pr-16",
                    reversed
                      ? "border-border/60 lg:order-2 lg:border-l lg:border-r-0 lg:pl-12 lg:pr-0 xl:pl-16"
                      : "border-border/60",
                  ].join(" ")}
                >
                  <Image
                    src={study.image}
                    alt={`${study.name} dashboard`}
                    width={300}
                    height={400}
                    className="aspect-[29/35] h-auto w-full max-w-60 rounded-2xl object-cover ring-1 ring-border transition-all duration-300 hover:scale-105"
                    loading="lazy"
                  />
                  <figure className="flex flex-col justify-between gap-8 text-left">
                    <blockquote className="text-left text-lg leading-relaxed text-foreground sm:text-xl">
                      <h3 className="text-left text-lg font-normal leading-relaxed text-foreground sm:text-xl">
                        {study.headline}{" "}
                        <span className="mt-2 block text-sm text-muted-foreground sm:text-base lg:text-lg">
                          {study.quote}
                        </span>
                      </h3>
                    </blockquote>
                    <figcaption className="mt-4 flex items-center gap-6 text-left">
                      <div className="flex flex-col gap-1">
                        <span className="text-md font-medium text-foreground">{study.name}</span>
                        <span className="text-sm text-muted-foreground">{study.role}</span>
                      </div>
                    </figcaption>
                  </figure>
                </div>

                {/* Right: Metrics */}
                <div
                  className={[
                    "grid grid-cols-1 gap-10 self-center text-left",
                    reversed ? "lg:order-1" : "",
                  ].join(" ")}
                >
                  {study.metrics.map((metric, i) => (
                    <MetricStat
                      key={`${study.id}-${i}`}
                      value={metric.value}
                      label={metric.label}
                      sub={metric.sub}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
