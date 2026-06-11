"use client";

/**
 * CTAWithVerticalMarquee — the provided closing CTA, tailored to Chippi:
 * the marquee scrolls who Chippi works for, the buttons are real links with
 * the honest trial copy. Center-distance opacity loop preserved; reduced
 * motion pauses the marquee (items render stacked, fully legible).
 */

import { cn } from "@/lib/utils";
import Link from "next/link";
import { ReactNode, useEffect, useRef } from "react";

interface VerticalMarqueeProps {
  children: ReactNode;
  pauseOnHover?: boolean;
  reverse?: boolean;
  className?: string;
  speed?: number;
}

function VerticalMarquee({
  children,
  pauseOnHover = false,
  reverse = false,
  className,
  speed = 30,
}: VerticalMarqueeProps) {
  return (
    <div
      className={cn("group flex flex-col overflow-hidden", className)}
      style={{ "--duration": `${speed}s` } as React.CSSProperties}
    >
      <div
        className={cn(
          "animate-marquee-vertical flex shrink-0 flex-col",
          reverse && "[animation-direction:reverse]",
          pauseOnHover && "group-hover:[animation-play-state:paused]",
        )}
      >
        {children}
      </div>
      <div
        className={cn(
          "animate-marquee-vertical flex shrink-0 flex-col",
          reverse && "[animation-direction:reverse]",
          pauseOnHover && "group-hover:[animation-play-state:paused]",
        )}
        aria-hidden="true"
      >
        {children}
      </div>
    </div>
  );
}

const marqueeItems = [
  "Solo realtors",
  "Buyer's agents",
  "Listing agents",
  "Teams",
  "Brokerages",
];

export default function CTAWithVerticalMarquee() {
  const marqueeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const marqueeContainer = marqueeRef.current;
    if (!marqueeContainer) return;

    let frame: number;
    const updateOpacity = () => {
      const items = marqueeContainer.querySelectorAll('.marquee-item');
      const containerRect = marqueeContainer.getBoundingClientRect();
      const centerY = containerRect.top + containerRect.height / 2;

      items.forEach((item) => {
        const itemRect = item.getBoundingClientRect();
        const itemCenterY = itemRect.top + itemRect.height / 2;
        const distance = Math.abs(centerY - itemCenterY);
        const maxDistance = containerRect.height / 2;
        const normalizedDistance = Math.min(distance / maxDistance, 1);
        const opacity = 1 - normalizedDistance * 0.75;
        (item as HTMLElement).style.opacity = opacity.toString();
      });
      frame = requestAnimationFrame(updateOpacity);
    };

    frame = requestAnimationFrame(updateOpacity);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div className="flex items-center justify-center overflow-hidden border-t border-border/60 bg-background px-6 py-12 text-foreground">
      <div className="animate-fade-in-up w-full max-w-7xl">
        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2 lg:gap-24">
          {/* Left Content */}
          <div className="max-w-xl space-y-8 py-12">
            <h2
              className="text-5xl font-medium leading-tight tracking-tight text-foreground md:text-6xl lg:text-7xl"
              style={{ fontFamily: 'var(--font-title)' }}
            >
              Get started in minutes
            </h2>
            <p className="text-lg leading-relaxed text-muted-foreground md:text-xl">
              Connect your inbox and Chippi starts working the leads today.
              7 days free, then $97/mo. Cancel anytime.
            </p>
            <div className="flex flex-wrap gap-4">
              <Link
                href="/login/realtor?intent=signup"
                className="group relative overflow-hidden rounded-full bg-foreground px-8 py-3 text-sm font-medium text-background transition-all duration-300 hover:scale-105"
              >
                <span className="relative z-10">Start free trial</span>
                <div className="absolute inset-0 translate-x-[-200%] bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 group-hover:translate-x-[200%]"></div>
              </Link>
              <Link
                href="/demo"
                className="group relative overflow-hidden rounded-full border border-border/70 bg-background px-8 py-3 text-sm font-medium text-foreground transition-all duration-300 hover:scale-105"
              >
                <span className="relative z-10">Book a 15-minute demo</span>
                <div className="absolute inset-0 translate-x-[-200%] bg-gradient-to-r from-transparent via-foreground/10 to-transparent transition-transform duration-700 group-hover:translate-x-[200%]"></div>
              </Link>
            </div>
          </div>

          {/* Right Marquee */}
          <div
            ref={marqueeRef}
            className="animate-fade-in-up relative flex h-[480px] items-center justify-center lg:h-[560px]"
          >
            <div className="relative h-full w-full">
              <VerticalMarquee speed={20} className="h-full">
                {marqueeItems.map((item, idx) => (
                  <div
                    key={idx}
                    className="marquee-item py-8 text-4xl font-light tracking-tight md:text-5xl lg:text-6xl"
                  >
                    {item}
                  </div>
                ))}
              </VerticalMarquee>

              {/* Top vignette */}
              <div className="pointer-events-none absolute left-0 right-0 top-0 z-10 h-48 bg-gradient-to-b from-background via-background/50 to-transparent"></div>

              {/* Bottom vignette */}
              <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-10 h-48 bg-gradient-to-t from-background via-background/50 to-transparent"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
