"use client";

/**
 * Scroll-morph hero — the provided IntroAnimation, tailored to Chippi:
 * the cards are LEAD HEADSHOT PLACEHOLDERS (initials tiles — no external
 * images), the copy is "All your leads in one place", and colors ride the
 * theme tokens. Mechanics preserved exactly: scatter → line → circle intro,
 * virtual-scroll morph from circle to a bottom arc, parallax, flip-on-hover.
 * Reduced motion renders a calm static avatar grid instead of the choreography.
 */

import React, { useState, useEffect, useMemo, useRef } from "react";
import { motion, useTransform, useSpring, useMotionValue, useReducedMotion } from "framer-motion";

export type AnimationPhase = "scatter" | "line" | "circle" | "bottom-strip";

interface Person {
    initials: string;
    name: string;
    tag: string;
}

interface FlipCardProps {
    person: Person;
    index: number;
    target: { x: number; y: number; rotation: number; scale: number; opacity: number };
}

const IMG_WIDTH = 60;
const IMG_HEIGHT = 85;

/* Warm placeholder tones for the headshot tiles — brand-adjacent, no photos. */
const TILE_TONES = [
    'from-brand-subtle to-muted/60',
    'from-muted/70 to-brand-subtle',
    'from-foreground/[0.06] to-brand-subtle',
    'from-brand-subtle to-foreground/[0.04]',
];

function FlipCard({ person, index, target }: FlipCardProps) {
    return (
        <motion.div
            animate={{
                x: target.x,
                y: target.y,
                rotate: target.rotation,
                scale: target.scale,
                opacity: target.opacity,
            }}
            transition={{ type: "spring", stiffness: 40, damping: 15 }}
            style={{
                position: "absolute",
                width: IMG_WIDTH,
                height: IMG_HEIGHT,
                transformStyle: "preserve-3d",
                perspective: "1000px",
            }}
            className="group cursor-pointer"
        >
            <motion.div
                className="relative h-full w-full"
                style={{ transformStyle: "preserve-3d" }}
                transition={{ duration: 0.6, type: "spring", stiffness: 260, damping: 20 }}
                whileHover={{ rotateY: 180 }}
            >
                {/* Front Face — headshot placeholder */}
                <div
                    className={`absolute inset-0 flex h-full w-full flex-col items-center justify-center overflow-hidden rounded-xl border border-border/60 bg-gradient-to-br shadow-lg ${TILE_TONES[index % TILE_TONES.length]}`}
                    style={{ backfaceVisibility: "hidden" }}
                >
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-foreground/10 text-[10px] font-semibold text-foreground/70">
                        {person.initials}
                    </span>
                    <p className="mt-1.5 max-w-full truncate px-1 text-[8px] font-medium text-foreground/70">{person.name}</p>
                </div>

                {/* Back Face */}
                <div
                    className="absolute inset-0 flex h-full w-full flex-col items-center justify-center overflow-hidden rounded-xl border border-border/70 bg-card p-2 shadow-lg"
                    style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
                >
                    <div className="text-center">
                        <p className="mb-1 text-[8px] font-bold uppercase tracking-widest text-brand">{person.tag}</p>
                        <p className="text-xs font-medium text-foreground">View lead</p>
                    </div>
                </div>
            </motion.div>
        </motion.div>
    );
}

const TOTAL_IMAGES = 20;
const MAX_SCROLL = 3000;

const PEOPLE: Person[] = [
    { initials: 'MP', name: 'Maya P.', tag: 'Hot' },
    { initials: 'TR', name: 'Tom R.', tag: 'Warm' },
    { initials: 'SV', name: 'Sara V.', tag: 'Hot' },
    { initials: 'EV', name: 'Eli V.', tag: 'Warm' },
    { initials: 'DL', name: 'Dana L.', tag: 'New' },
    { initials: 'BN', name: 'Bernard N.', tag: 'Closed' },
    { initials: 'PN', name: 'Priya N.', tag: 'Hot' },
    { initials: 'GR', name: 'Glodie R.', tag: 'Warm' },
    { initials: 'JM', name: 'Jon M.', tag: 'New' },
    { initials: 'AS', name: 'Ana S.', tag: 'Hot' },
    { initials: 'KL', name: 'Kim L.', tag: 'Warm' },
    { initials: 'OB', name: 'Omar B.', tag: 'New' },
    { initials: 'CW', name: 'Cara W.', tag: 'Hot' },
    { initials: 'FH', name: 'Finn H.', tag: 'Warm' },
    { initials: 'LT', name: 'Lena T.', tag: 'New' },
    { initials: 'RD', name: 'Ray D.', tag: 'Closed' },
    { initials: 'NB', name: 'Nina B.', tag: 'Hot' },
    { initials: 'VM', name: 'Vic M.', tag: 'Warm' },
    { initials: 'IS', name: 'Isla S.', tag: 'New' },
    { initials: 'HG', name: 'Hugo G.', tag: 'Warm' },
];

const lerp = (start: number, end: number, t: number) => start * (1 - t) + end * t;

export default function IntroAnimation() {
    const reduce = useReducedMotion();
    const [introPhase, setIntroPhase] = useState<AnimationPhase>("scatter");
    const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
    const containerRef = useRef<HTMLDivElement>(null);

    // --- Container Size ---
    useEffect(() => {
        if (!containerRef.current) return;

        const handleResize = (entries: ResizeObserverEntry[]) => {
            for (const entry of entries) {
                setContainerSize({
                    width: entry.contentRect.width,
                    height: entry.contentRect.height,
                });
            }
        };

        const observer = new ResizeObserver(handleResize);
        observer.observe(containerRef.current);

        setContainerSize({
            width: containerRef.current.offsetWidth,
            height: containerRef.current.offsetHeight,
        });

        return () => observer.disconnect();
    }, []);

    // --- Virtual Scroll Logic ---
    const virtualScroll = useMotionValue(0);
    const scrollRef = useRef(0);

    useEffect(() => {
        const container = containerRef.current;
        if (!container || reduce) return;

        const handleWheel = (e: WheelEvent) => {
            // Hijack the wheel only while the morph is in progress — once the
            // arc is formed (or back at zero scrolling up), let the page move
            // so the hero can't trap the visitor.
            const next = Math.min(Math.max(scrollRef.current + e.deltaY, 0), MAX_SCROLL);
            const atEnd = scrollRef.current >= MAX_SCROLL && e.deltaY > 0;
            const atStart = scrollRef.current <= 0 && e.deltaY < 0;
            if (!atEnd && !atStart) e.preventDefault();
            scrollRef.current = next;
            virtualScroll.set(next);
        };

        let touchStartY = 0;
        const handleTouchStart = (e: TouchEvent) => {
            touchStartY = e.touches[0].clientY;
        };
        const handleTouchMove = (e: TouchEvent) => {
            const touchY = e.touches[0].clientY;
            const deltaY = touchStartY - touchY;
            touchStartY = touchY;
            const atEnd = scrollRef.current >= MAX_SCROLL && deltaY > 0;
            const atStart = scrollRef.current <= 0 && deltaY < 0;
            if (!atEnd && !atStart) e.preventDefault();
            const newScroll = Math.min(Math.max(scrollRef.current + deltaY, 0), MAX_SCROLL);
            scrollRef.current = newScroll;
            virtualScroll.set(newScroll);
        };

        container.addEventListener("wheel", handleWheel, { passive: false });
        container.addEventListener("touchstart", handleTouchStart, { passive: false });
        container.addEventListener("touchmove", handleTouchMove, { passive: false });

        return () => {
            container.removeEventListener("wheel", handleWheel);
            container.removeEventListener("touchstart", handleTouchStart);
            container.removeEventListener("touchmove", handleTouchMove);
        };
    }, [virtualScroll, reduce]);

    // 1. Morph Progress: 0 (Circle) -> 1 (Bottom Arc)
    const morphProgress = useTransform(virtualScroll, [0, 600], [0, 1]);
    const smoothMorph = useSpring(morphProgress, { stiffness: 40, damping: 20 });

    // 2. Scroll Rotation (Shuffling)
    const scrollRotate = useTransform(virtualScroll, [600, 3000], [0, 360]);
    const smoothScrollRotate = useSpring(scrollRotate, { stiffness: 40, damping: 20 });

    // --- Mouse Parallax ---
    const mouseX = useMotionValue(0);
    const smoothMouseX = useSpring(mouseX, { stiffness: 30, damping: 20 });

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const handleMouseMove = (e: MouseEvent) => {
            const rect = container.getBoundingClientRect();
            const relativeX = e.clientX - rect.left;
            const normalizedX = (relativeX / rect.width) * 2 - 1;
            mouseX.set(normalizedX * 100);
        };
        container.addEventListener("mousemove", handleMouseMove);
        return () => container.removeEventListener("mousemove", handleMouseMove);
    }, [mouseX]);

    // --- Intro Sequence ---
    useEffect(() => {
        if (reduce) return;
        const timer1 = setTimeout(() => setIntroPhase("line"), 500);
        const timer2 = setTimeout(() => setIntroPhase("circle"), 2500);
        return () => { clearTimeout(timer1); clearTimeout(timer2); };
    }, [reduce]);

    // --- Random Scatter Positions ---
    const scatterPositions = useMemo(() => {
        return PEOPLE.map(() => ({
            x: (Math.random() - 0.5) * 1500,
            y: (Math.random() - 0.5) * 1000,
            rotation: (Math.random() - 0.5) * 180,
            scale: 0.6,
            opacity: 0,
        }));
    }, []);

    // --- Render Loop (Manual Calculation for Morph) ---
    const [morphValue, setMorphValue] = useState(0);
    const [rotateValue, setRotateValue] = useState(0);
    const [parallaxValue, setParallaxValue] = useState(0);

    useEffect(() => {
        const unsubscribeMorph = smoothMorph.on("change", setMorphValue);
        const unsubscribeRotate = smoothScrollRotate.on("change", setRotateValue);
        const unsubscribeParallax = smoothMouseX.on("change", setParallaxValue);
        return () => {
            unsubscribeMorph();
            unsubscribeRotate();
            unsubscribeParallax();
        };
    }, [smoothMorph, smoothScrollRotate, smoothMouseX]);

    // --- Content Opacity ---
    const contentOpacity = useTransform(smoothMorph, [0.8, 1], [0, 1]);
    const contentY = useTransform(smoothMorph, [0.8, 1], [20, 0]);

    // Reduced motion: a calm static grid — every lead visible, no choreography.
    if (reduce) {
        return (
            <div className="relative w-full overflow-hidden bg-background px-6 py-16">
                <div className="mx-auto max-w-2xl text-center">
                    <h1 className="text-2xl font-medium tracking-tight text-foreground md:text-4xl">
                        All your leads in one place.
                    </h1>
                </div>
                <div className="mx-auto mt-10 grid max-w-2xl grid-cols-5 gap-3 sm:grid-cols-10">
                    {PEOPLE.map((p, i) => (
                        <div
                            key={p.name}
                            className={`flex aspect-[60/85] flex-col items-center justify-center rounded-xl border border-border/60 bg-gradient-to-br ${TILE_TONES[i % TILE_TONES.length]}`}
                        >
                            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-foreground/10 text-[10px] font-semibold text-foreground/70">
                                {p.initials}
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div ref={containerRef} className="relative h-full w-full overflow-hidden bg-background">
            <div className="perspective-1000 flex h-full w-full flex-col items-center justify-center">

                {/* Intro Text (Fades out) */}
                <div className="pointer-events-none absolute top-1/2 z-0 flex -translate-y-1/2 flex-col items-center justify-center text-center">
                    <motion.h1
                        initial={{ opacity: 0, y: 20, filter: "blur(10px)" }}
                        animate={introPhase === "circle" && morphValue < 0.5 ? { opacity: 1 - morphValue * 2, y: 0, filter: "blur(0px)" } : { opacity: 0, filter: "blur(10px)" }}
                        transition={{ duration: 1 }}
                        className="text-2xl font-medium tracking-tight text-foreground md:text-4xl"
                    >
                        All your leads in one place.
                    </motion.h1>
                    <motion.p
                        initial={{ opacity: 0 }}
                        animate={introPhase === "circle" && morphValue < 0.5 ? { opacity: 0.5 - morphValue } : { opacity: 0 }}
                        transition={{ duration: 1, delay: 0.2 }}
                        className="mt-4 text-xs font-bold tracking-[0.2em] text-muted-foreground"
                    >
                        SCROLL TO EXPLORE
                    </motion.p>
                </div>

                {/* Arc Active Content (Fades in) */}
                <motion.div
                    style={{ opacity: contentOpacity, y: contentY }}
                    className="pointer-events-none absolute top-[10%] z-10 flex flex-col items-center justify-center px-4 text-center"
                >
                    <h2 className="mb-4 text-3xl font-semibold tracking-tight text-foreground md:text-5xl">
                        Meet Chippi.
                    </h2>
                    <p className="max-w-lg text-sm leading-relaxed text-muted-foreground md:text-base">
                        Every lead, scored and remembered. <br className="hidden md:block" />
                        Chippi reads the inbox, knows who to call first, and keeps every
                        relationship moving — while you close.
                    </p>
                </motion.div>

                {/* Main Container */}
                <div className="relative flex h-full w-full items-center justify-center">
                    {PEOPLE.slice(0, TOTAL_IMAGES).map((person, i) => {
                        let target = { x: 0, y: 0, rotation: 0, scale: 1, opacity: 1 };

                        if (introPhase === "scatter") {
                            target = scatterPositions[i];
                        } else if (introPhase === "line") {
                            const lineSpacing = 70;
                            const lineTotalWidth = TOTAL_IMAGES * lineSpacing;
                            const lineX = i * lineSpacing - lineTotalWidth / 2;
                            target = { x: lineX, y: 0, rotation: 0, scale: 1, opacity: 1 };
                        } else {
                            const isMobile = containerSize.width < 768;
                            const minDimension = Math.min(containerSize.width, containerSize.height);

                            const circleRadius = Math.min(minDimension * 0.35, 350);
                            const circleAngle = (i / TOTAL_IMAGES) * 360;
                            const circleRad = (circleAngle * Math.PI) / 180;
                            const circlePos = {
                                x: Math.cos(circleRad) * circleRadius,
                                y: Math.sin(circleRad) * circleRadius,
                                rotation: circleAngle + 90,
                            };

                            const baseRadius = Math.min(containerSize.width, containerSize.height * 1.5);
                            const arcRadius = baseRadius * (isMobile ? 1.4 : 1.1);
                            const arcApexY = containerSize.height * (isMobile ? 0.35 : 0.25);
                            const arcCenterY = arcApexY + arcRadius;

                            const spreadAngle = isMobile ? 100 : 130;
                            const startAngle = -90 - (spreadAngle / 2);
                            const step = spreadAngle / (TOTAL_IMAGES - 1);

                            const scrollProgress = Math.min(Math.max(rotateValue / 360, 0), 1);
                            const maxRotation = spreadAngle * 0.8;
                            const boundedRotation = -scrollProgress * maxRotation;

                            const currentArcAngle = startAngle + (i * step) + boundedRotation;
                            const arcRad = (currentArcAngle * Math.PI) / 180;

                            const arcPos = {
                                x: Math.cos(arcRad) * arcRadius + parallaxValue,
                                y: Math.sin(arcRad) * arcRadius + arcCenterY,
                                rotation: currentArcAngle + 90,
                                scale: isMobile ? 1.4 : 1.8,
                            };

                            target = {
                                x: lerp(circlePos.x, arcPos.x, morphValue),
                                y: lerp(circlePos.y, arcPos.y, morphValue),
                                rotation: lerp(circlePos.rotation, arcPos.rotation, morphValue),
                                scale: lerp(1, arcPos.scale, morphValue),
                                opacity: 1,
                            };
                        }

                        return (
                            <FlipCard
                                key={i}
                                person={person}
                                index={i}
                                target={target}
                            />
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
