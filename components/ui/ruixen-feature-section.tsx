"use client"

/**
 * RuixenSection — the provided two-block feature section (rotating testimonial
 * card-stack + glowing integration list + stats + quote), tailored to Chippi.
 */

import { cn } from "@/lib/utils"
import { CardContent } from "@/components/ui/card";
import { TbHeartPlus } from "react-icons/tb";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";

export const Highlight = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => {
  return (
    <span
      className={cn(
        "bg-brand-subtle px-1 py-0.5 font-bold text-brand",
        className
      )}
    >
      {children}
    </span>
  );
};

const CARDS = [
  {
    id: 0,
    name: "Sarah Chen",
    designation: "Solo realtor · East Bay",
    content: (
      <p>
        <Highlight>Chippi</Highlight> reads my inbox before I do. The reply is{" "}
        <Highlight>already drafted in my voice</Highlight> when I open the thread — I tap
        approve between showings.
      </p>
    ),
  },
  {
    id: 1,
    name: "Alex Rodriguez",
    designation: "Team lead · 12 agents",
    content: (
      <p>
        The <Highlight>pipeline updates itself</Highlight>. Tours, offers, closings — the
        board reflects reality every morning without anyone{" "}
        <Highlight>touching a spreadsheet</Highlight>.
      </p>
    ),
  },
  {
    id: 2,
    name: "David Kim",
    designation: "Broker-owner",
    content: (
      <p>
        Leads route themselves by <Highlight>territory and load</Highlight>, and stalled
        deals surface before they die. I see the whole floor{" "}
        <Highlight>without a status meeting</Highlight>.
      </p>
    ),
  },
];

const integrations = [
  {
    name: "Gmail & Outlook",
    desc: "Chippi reads, scores, and drafts right in your inbox",
    icon: "✉️",
  },
  {
    name: "Follow-up Boss & kvCORE",
    desc: "Two-way sync with the CRM your floor already uses",
    icon: "🔄",
  }
];

export default function RuixenSection() {
  return (
    <section className="mx-auto max-w-7xl py-2 sm:py-4">
      <div className="relative grid grid-cols-1 lg:grid-cols-2">
        {/* Left Block */}
        <div className="flex flex-col items-start justify-center border border-border/60 p-4 sm:p-6 lg:p-8">
          {/* Card */}
          <div className="relative mb-4 w-full sm:mb-6">
            <div className="absolute inset-x-0 -bottom-2 z-10 h-16 bg-gradient-to-t from-background to-transparent sm:h-20 lg:h-24"></div>
            <CardStack items={CARDS} />
          </div>

          {/* Content */}
          <h3 className="text-lg font-normal leading-relaxed text-foreground sm:text-xl lg:text-2xl">
            One agent, the whole job <span className="text-brand">Chippi</span>{" "}
            <span className="text-sm text-muted-foreground sm:text-base lg:text-lg">
              {" "}The inbox, the pipeline, the follow-ups, the content — realtors and
              brokers describe the same thing: the busywork runs itself.
            </span>
          </h3>
        </div>

        {/* Right Block */}
        <div className="flex flex-col items-center justify-start border border-border/60 p-4 sm:p-6 lg:p-8">
          <h3 className="mb-4 text-lg font-normal leading-relaxed text-foreground sm:mb-6 sm:text-xl lg:text-2xl">
            Plugged into your stack <span className="text-brand">Chippi</span>{" "}
            <span className="text-sm text-muted-foreground sm:text-base lg:text-lg">
              {" "}Connect the tools you already pay for and Chippi works inside them —
              no migration, no double entry.
            </span>
          </h3>
          <div
            className={cn(
              "group relative mt-auto inline-flex w-full animate-rainbow cursor-pointer items-center justify-center rounded-xl border-0 bg-background px-4 py-2 font-medium text-foreground transition-colors [background-clip:padding-box,border-box,border-box] [background-origin:border-box] [border:calc(0.08*1rem)_solid_transparent] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 sm:px-6 lg:px-8",

              // before styles
              "before:absolute before:bottom-[8%] before:left-1/2 before:z-0 before:h-1/5 before:w-3/5 before:-translate-x-1/2 before:animate-rainbow before:bg-[linear-gradient(90deg,hsl(var(--color-1)),hsl(var(--color-5)),hsl(var(--color-3)),hsl(var(--color-4)),hsl(var(--color-2)))] before:bg-[length:200%] before:[filter:blur(calc(0.8*1rem))]",
            )}
          >
            {/* Integration List */}
            <CardContent className="z-10 w-full space-y-3 rounded-2xl border border-border/60 bg-background p-3 sm:space-y-4 sm:rounded-3xl sm:p-4 lg:p-6">
              {integrations.map((item, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-xl border border-border/60 p-2 transition hover:bg-muted/50 sm:rounded-2xl sm:p-3"
                >
                  <div className="flex flex-1 items-center gap-2 sm:gap-3">
                    <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg bg-muted text-sm sm:h-8 sm:w-8 sm:text-lg">
                      {item.icon}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-foreground sm:text-sm">{item.name}</p>
                      <p className="line-clamp-1 text-xs text-muted-foreground sm:line-clamp-2">{item.desc}</p>
                    </div>
                  </div>
                  <button className="ml-2 flex-shrink-0 rounded-full border border-border/60 p-1.5 text-xs font-semibold sm:p-2"><TbHeartPlus className="h-3 w-3 sm:h-4 sm:w-4" /></button>
                </div>
              ))}
            </CardContent>
          </div>
        </div>
      </div>

      {/* Stats and Testimonial Section */}
      <div className="mt-12 grid gap-8 sm:mt-16 lg:mt-20 lg:grid-cols-2 lg:gap-12 xl:gap-16">
        <div className="flex items-center justify-center p-4 sm:p-6">
          <div className="grid w-full grid-cols-3 gap-6 text-center sm:gap-8 sm:text-left lg:gap-6 xl:gap-8">
            <div className="space-y-2 sm:space-y-3">
              <div className="text-2xl font-medium text-foreground sm:text-3xl lg:text-4xl" style={{ fontFamily: 'var(--font-title)' }}>50+</div>
              <p className="text-sm text-muted-foreground sm:text-base">Integrations</p>
            </div>
            <div className="space-y-2 sm:space-y-3">
              <div className="text-2xl font-medium text-foreground sm:text-3xl lg:text-4xl" style={{ fontFamily: 'var(--font-title)' }}>24/7</div>
              <p className="text-sm text-muted-foreground sm:text-base">Working your book</p>
            </div>
            <div className="space-y-2 sm:space-y-3">
              <div className="text-2xl font-medium text-foreground sm:text-3xl lg:text-4xl" style={{ fontFamily: 'var(--font-title)' }}>6 → 1</div>
              <p className="text-sm text-muted-foreground sm:text-base">Tools replaced</p>
            </div>
          </div>
        </div>
        <div className="relative">
          <blockquote className="border-l-2 border-brand pl-4 text-muted-foreground sm:pl-6 lg:pl-8">
            <p className="text-sm leading-relaxed sm:text-base lg:text-lg">
              It&apos;s like hiring an assistant who already knows my whole book of
              business — the drafts sound like me, the board is never stale, and
              nothing leaves without my name on it.
            </p>
            <div className="mt-4 space-y-2 sm:mt-6 sm:space-y-3">
              <cite className="block text-sm font-medium not-italic text-foreground sm:text-base">Early Chippi realtor</cite>
              <span className="text-xs text-muted-foreground">Solo agent, 60+ active leads</span>
            </div>
          </blockquote>
        </div>
      </div>
    </section>
  )
}

let interval: ReturnType<typeof setInterval>;

type Card = {
  id: number;
  name: string;
  designation: string;
  content: React.ReactNode;
};

export const CardStack = ({
  items,
  offset,
  scaleFactor,
}: {
  items: Card[];
  offset?: number;
  scaleFactor?: number;
}) => {
  const CARD_OFFSET = offset || 10;
  const SCALE_FACTOR = scaleFactor || 0.06;
  const [cards, setCards] = useState<Card[]>(items);

  useEffect(() => {
    startFlipping();

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const startFlipping = () => {
    interval = setInterval(() => {
      setCards((prevCards: Card[]) => {
        const newArray = [...prevCards]; // create a copy of the array
        newArray.unshift(newArray.pop()!); // move the last element to the front
        return newArray;
      });
    }, 5000);
  };

  return (
    <div className="relative mx-auto my-4 h-48 w-full md:h-48 md:w-96">
      {cards.map((card, index) => {
        return (
          <motion.div
            key={card.id}
            className="absolute flex h-48 w-full flex-col justify-between rounded-3xl border border-border/70 bg-card p-4 shadow-xl shadow-foreground/[0.06] md:h-48 md:w-96"
            style={{
              transformOrigin: "top center",
            }}
            animate={{
              top: index * -CARD_OFFSET,
              scale: 1 - index * SCALE_FACTOR,
              zIndex: cards.length - index,
            }}
          >
            <div className="font-normal text-foreground/80">
              {card.content}
            </div>
            <div>
              <p className="font-medium text-foreground">
                {card.name}
              </p>
              <p className="font-normal text-muted-foreground">
                {card.designation}
              </p>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
};
