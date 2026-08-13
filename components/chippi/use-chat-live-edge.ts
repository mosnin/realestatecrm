'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';

export const CHAT_LIVE_EDGE_THRESHOLD_PX = 72;

export interface ScrollMetrics {
  scrollHeight: number;
  scrollTop: number;
  clientHeight: number;
}

/**
 * Distance from the visible viewport to the newest transcript content.
 * Exported so the follow contract can be tested without a browser DOM.
 */
export function distanceFromChatLiveEdge(metrics: ScrollMetrics): number {
  return Math.max(
    0,
    metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight,
  );
}

export function isAtChatLiveEdge(
  metrics: ScrollMetrics,
  threshold = CHAT_LIVE_EDGE_THRESHOLD_PX,
): boolean {
  return distanceFromChatLiveEdge(metrics) <= threshold;
}

interface UseChatLiveEdgeOptions {
  /** A different conversation starts at its newest message. */
  conversationKey: string | null;
  /** Removes smooth travel for people who request reduced motion. */
  reduceMotion: boolean;
}

interface ChatLiveEdgeController {
  rootRef: RefObject<HTMLDivElement | null>;
  contentRef: RefObject<HTMLDivElement | null>;
  following: boolean;
  hasNewContent: boolean;
  jumpToLatest: () => void;
}

function scrollViewportToEnd(
  viewport: HTMLElement,
  behavior: ScrollBehavior,
): void {
  const top = viewport.scrollHeight;
  if (typeof viewport.scrollTo === 'function') {
    viewport.scrollTo({ top, behavior });
  } else {
    viewport.scrollTop = top;
  }
}

/**
 * ChatGPT-style live-edge ownership for the Chippi transcript.
 *
 * Output follows only while the reader remains near the end. Scrolling up,
 * paging up, or touching the transcript releases that ownership immediately;
 * new tokens then leave the viewport alone and surface a Jump to latest
 * affordance. No message state or server event is inferred here.
 */
export function useChatLiveEdge({
  conversationKey,
  reduceMotion,
}: UseChatLiveEdgeOptions): ChatLiveEdgeController {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const followingRef = useRef(true);
  const programmaticRef = useRef(false);
  const frameRef = useRef<number | null>(null);
  const releaseTimerRef = useRef<number | null>(null);
  const [following, setFollowingState] = useState(true);
  const [hasNewContent, setHasNewContent] = useState(false);

  const viewport = useCallback(
    () =>
      rootRef.current?.querySelector<HTMLElement>(
        '[data-slot="scroll-area-viewport"]',
      ) ?? null,
    [],
  );

  const setFollowing = useCallback((next: boolean) => {
    followingRef.current = next;
    setFollowingState(next);
    if (next) setHasNewContent(false);
  }, []);

  const scheduleScrollToEnd = useCallback(
    (behavior: ScrollBehavior) => {
      const node = viewport();
      if (!node) return;
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = requestAnimationFrame(() => {
        programmaticRef.current = true;
        scrollViewportToEnd(node, behavior);
        if (releaseTimerRef.current !== null) {
          window.clearTimeout(releaseTimerRef.current);
        }
        releaseTimerRef.current = window.setTimeout(() => {
          programmaticRef.current = false;
          releaseTimerRef.current = null;
        }, behavior === 'smooth' ? 320 : 0);
      });
    },
    [viewport],
  );

  const jumpToLatest = useCallback(() => {
    setFollowing(true);
    scheduleScrollToEnd(reduceMotion ? 'auto' : 'smooth');
  }, [reduceMotion, scheduleScrollToEnd, setFollowing]);

  useEffect(() => {
    const node = viewport();
    if (!node) return;

    const updateFromScroll = () => {
      if (programmaticRef.current) return;
      setFollowing(isAtChatLiveEdge(node));
    };
    const releaseFollow = () => {
      programmaticRef.current = false;
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (['ArrowUp', 'PageUp', 'Home'].includes(event.key)) releaseFollow();
    };

    node.addEventListener('scroll', updateFromScroll, { passive: true });
    node.addEventListener('wheel', releaseFollow, { passive: true });
    node.addEventListener('touchstart', releaseFollow, { passive: true });
    node.addEventListener('keydown', handleKeyDown);
    return () => {
      node.removeEventListener('scroll', updateFromScroll);
      node.removeEventListener('wheel', releaseFollow);
      node.removeEventListener('touchstart', releaseFollow);
      node.removeEventListener('keydown', handleKeyDown);
    };
  }, [setFollowing, viewport]);

  useEffect(() => {
    const content = contentRef.current;
    if (!content || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(() => {
      if (followingRef.current) {
        scheduleScrollToEnd(reduceMotion ? 'auto' : 'smooth');
      } else {
        setHasNewContent(true);
      }
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, [reduceMotion, scheduleScrollToEnd]);

  useEffect(() => {
    setFollowing(true);
    scheduleScrollToEnd('auto');
  }, [conversationKey, scheduleScrollToEnd, setFollowing]);

  useEffect(
    () => () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      if (releaseTimerRef.current !== null) {
        window.clearTimeout(releaseTimerRef.current);
      }
    },
    [],
  );

  return {
    rootRef,
    contentRef,
    following,
    hasNewContent,
    jumpToLatest,
  };
}
