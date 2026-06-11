"use client";

/**
 * GalleryHoverCarousel — the provided embla feature carousel, tailored to
 * Chippi: items are the product's features linking into their pages, and the
 * image slots are deliberately BLANK placeholders (labeled, dot-grid) until
 * real screenshots are dropped in — no external image URLs to 404.
 */

import { ArrowRight, ChevronLeft, ChevronRight, ImageIcon } from "lucide-react";
import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
} from "@/components/ui/carousel";
import type { CarouselApi } from "@/components/ui/carousel";
import Image from "next/image";
import Link from "next/link";

interface GalleryHoverCarouselItem {
  id: string;
  title: string;
  summary: string;
  url: string;
  image: string;
}

export default function GalleryHoverCarousel({
  heading = "Everything Chippi runs for you.",
  items = [
    {
      id: "item-1",
      title: "The inbox, triaged",
      summary:
        "Every inbound read and scored against your live deals — the one that matters lifted to the top.",
      url: "/realtors",
      image: "https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=800&h=600&fit=crop&q=80",
    },
    {
      id: "item-2",
      title: "Drafts in your voice",
      summary:
        "Replies written the way you actually write, waiting before you open the thread. Nothing sends without your tap.",
      url: "/realtors",
      image: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800&h=600&fit=crop&q=80",
    },
    {
      id: "item-3",
      title: "A pipeline that runs itself",
      summary:
        "Deals advance as things happen — tours booked, offers in, outcomes logged in plain language.",
      url: "/deals",
      image: "https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=800&h=600&fit=crop&q=80",
    },
    {
      id: "item-4",
      title: "Content on the go",
      summary:
        "Just listed, open house, just sold — drafted and formatted for every channel from your phone.",
      url: "/studio",
      image: "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=800&h=600&fit=crop&q=80",
    },
    {
      id: "item-5",
      title: "Every file, filed",
      summary:
        "Contracts, disclosures, photos — auto-filed to the right deal and found in one search.",
      url: "/files",
      image: "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800&h=600&fit=crop&q=80",
    },
  ],
}: {
  heading?: string;
  demoUrl?: string;
  items?: GalleryHoverCarouselItem[];
}) {
  const [carouselApi, setCarouselApi] = useState<CarouselApi>();
  const [canScrollPrev, setCanScrollPrev] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(false);

  // Carousel scroll tracking
  useEffect(() => {
    if (!carouselApi) return;
    const update = () => {
      setCanScrollPrev(carouselApi.canScrollPrev());
      setCanScrollNext(carouselApi.canScrollNext());
    };
    update();
    carouselApi.on("select", update);
    return () => {
      carouselApi.off("select", update);
    };
  }, [carouselApi]);

  return (
    <section className="py-2 sm:py-4">
      <div className="container mx-auto px-6">
        <div className="mb-8 flex flex-col justify-between md:flex-row md:items-end">
          {heading ? (
            <div className="max-w-2xl">
              <h3 className="text-lg leading-relaxed text-foreground sm:text-xl lg:text-3xl" style={{ fontFamily: "var(--font-title)" }}>
                {heading}{" "}
                <span className="text-sm text-muted-foreground sm:text-base lg:text-3xl">
                  Hover a card to see what each piece does — then open it on its own page.
                </span>
              </h3>
            </div>
          ) : (
            <div />
          )}
          <div className="mt-4 flex gap-2 md:mt-0">
            <Button
              variant="outline"
              size="icon"
              onClick={() => carouselApi?.scrollPrev()}
              disabled={!canScrollPrev}
              className="h-10 w-10 rounded-full"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => carouselApi?.scrollNext()}
              disabled={!canScrollNext}
              className="h-10 w-10 rounded-full"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="w-full max-w-full">
          <Carousel
            setApi={setCarouselApi}
            opts={{ breakpoints: { "(max-width: 768px)": { dragFree: true } } }}
            className="relative w-full max-w-full"
          >
            <CarouselContent className="hide-scrollbar w-full max-w-full md:-mr-4 md:ml-4">
              {items.map((item) => (
                <CarouselItem key={item.id} className="ml-6 md:max-w-[350px]">
                  <Link href={item.url} className="group relative block h-[300px] w-full md:h-[350px]">
                    <Card className="h-full w-full overflow-hidden rounded-3xl border-border/70 p-0 shadow-none">
                      {/* Image — blank labeled placeholder until real shots land */}
                      <div className="relative h-full w-full transition-all duration-500 group-hover:h-1/2">
                        {item.image ? (
                          <Image
                            width={400}
                            height={300}
                            src={item.image}
                            alt={item.title}
                            className="h-full w-full object-cover object-center"
                          />
                        ) : (
                          <div
                            className="flex h-full w-full flex-col items-center justify-center"
                            style={{
                              backgroundImage:
                                'radial-gradient(circle at 1px 1px, var(--border) 1px, transparent 0)',
                              backgroundSize: '22px 22px',
                            }}
                          >
                            <span className="flex h-11 w-11 items-center justify-center rounded-full border border-border/70 bg-background/80 text-muted-foreground">
                              <ImageIcon className="h-5 w-5" />
                            </span>
                            <p className="mt-3 text-sm font-medium text-foreground/80">{item.title}</p>
                            <p className="mt-0.5 text-[11px] uppercase tracking-wider text-muted-foreground">Screenshot slot</p>
                          </div>
                        )}
                        {/* Fade overlay at bottom */}
                        <div className="absolute bottom-0 left-0 h-20 w-full bg-gradient-to-t from-black/60 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
                      </div>

                      {/* Text Section */}
                      <div className="absolute bottom-0 left-0 w-full flex-col justify-center bg-background/95 px-4 opacity-0 backdrop-blur-sm transition-all duration-500 group-hover:flex group-hover:h-1/2 group-hover:opacity-100">
                        <h3 className="text-lg font-medium md:text-xl">{item.title}</h3>
                        <p className="line-clamp-2 text-sm text-muted-foreground md:text-base">
                          {item.summary}
                        </p>
                        <Button
                          variant="outline"
                          size="icon"
                          className="absolute bottom-2 right-2 mt-2 flex items-center gap-1 rounded-full border border-border px-0 text-foreground transition-all duration-500 hover:-rotate-45"
                        >
                          <ArrowRight className="size-4" />
                        </Button>
                      </div>
                    </Card>
                  </Link>
                </CarouselItem>
              ))}
            </CarouselContent>
          </Carousel>
        </div>
      </div>
    </section>
  );
}
