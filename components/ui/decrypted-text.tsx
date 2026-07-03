"use client";

/**
 * DecryptedText — text resolves out of scrambled glyphs, character by
 * character, when it scrolls into view.
 *
 * Lean, typed reimplementation of the react-bits `DecryptedText` idea. The
 * registry drop is an 11KB JSX component with hover/click modes and five
 * reveal directions we'd never ship; this keeps the one behavior that earns
 * its place — view-triggered sequential decryption — and adds what the
 * original lacks:
 *   - `prefers-reduced-motion`: renders the plain text, no scramble.
 *   - SSR-safe: first paint is the real text (no hydration flicker, no
 *     scrambled content for crawlers); the scramble only starts client-side
 *     when the element enters the viewport.
 *   - Screen readers always get the real text (scramble is aria-hidden).
 */

import { useEffect, useRef, useState } from "react";
import { useInView, useReducedMotion } from "framer-motion";

const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz#$%&*+-";

export function DecryptedText({
  text,
  /** ms between each character locking in. */
  speed = 28,
  className,
}: {
  text: string;
  speed?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  const reduce = useReducedMotion();
  const [display, setDisplay] = useState(text);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (!inView || reduce || started) return;
    setStarted(true);
    let revealed = 0;
    const id = setInterval(() => {
      revealed += 1;
      if (revealed >= text.length) {
        setDisplay(text);
        clearInterval(id);
        return;
      }
      setDisplay(
        text
          .split("")
          .map((ch, i) =>
            ch === " " || i < revealed
              ? ch
              : GLYPHS[Math.floor(Math.random() * GLYPHS.length)],
          )
          .join(""),
      );
    }, speed);
    return () => clearInterval(id);
  }, [inView, reduce, started, text, speed]);

  return (
    <span ref={ref} className={className}>
      <span className="sr-only">{text}</span>
      <span aria-hidden>{reduce ? text : display}</span>
    </span>
  );
}

export default DecryptedText;
