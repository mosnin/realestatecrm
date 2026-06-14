'use client';

/**
 * Draggable property cards, the physics-y throwable cards from the source
 * component, recolored to the calm card vocabulary (bg-card + hairline + the
 * sanctioned marketing shadow, not bg-neutral). Used on /properties to make
 * "every listing in one place" feel tactile: toss the cards around, they
 * settle. Drag is pointer-only; there's a static message behind them, so
 * keyboard/reduced-motion users still get the full point without the toy.
 */

import { cn } from '@/lib/utils';
import React, { useRef, useState, useEffect } from 'react';
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  animate,
  useVelocity,
  useAnimationControls,
} from 'framer-motion';

export function DraggableCardContainer({ className, children }: { className?: string; children?: React.ReactNode }) {
  return <div className={cn('[perspective:3000px]', className)}>{children}</div>;
}

export function DraggableCardBody({ className, children }: { className?: string; children?: React.ReactNode }) {
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const cardRef = useRef<HTMLDivElement>(null);
  const controls = useAnimationControls();
  const [constraints, setConstraints] = useState({ top: 0, left: 0, right: 0, bottom: 0 });

  const velocityX = useVelocity(mouseX);
  const velocityY = useVelocity(mouseY);
  const springConfig = { stiffness: 100, damping: 20, mass: 0.5 };

  const rotateX = useSpring(useTransform(mouseY, [-300, 300], [12, -12]), springConfig);
  const rotateY = useSpring(useTransform(mouseX, [-300, 300], [-12, 12]), springConfig);
  const opacity = useSpring(useTransform(mouseX, [-300, 0, 300], [0.85, 1, 0.85]), springConfig);
  const glareOpacity = useSpring(useTransform(mouseX, [-300, 0, 300], [0.12, 0, 0.12]), springConfig);

  useEffect(() => {
    const update = () => {
      if (typeof window === 'undefined') return;
      setConstraints({
        top: -window.innerHeight / 2,
        left: -window.innerWidth / 2,
        right: window.innerWidth / 2,
        bottom: window.innerHeight / 2,
      });
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const { clientX, clientY } = e;
    const { width, height, left, top } = cardRef.current?.getBoundingClientRect() ?? {
      width: 0,
      height: 0,
      left: 0,
      top: 0,
    };
    mouseX.set(clientX - (left + width / 2));
    mouseY.set(clientY - (top + height / 2));
  };

  const handleMouseLeave = () => {
    mouseX.set(0);
    mouseY.set(0);
  };

  return (
    <motion.div
      ref={cardRef}
      drag
      dragConstraints={constraints}
      onDragStart={() => {
        document.body.style.cursor = 'grabbing';
      }}
      onDragEnd={(_event, info) => {
        document.body.style.cursor = 'default';
        controls.start({ rotateX: 0, rotateY: 0, transition: { type: 'spring', ...springConfig } });
        const vx = velocityX.get();
        const vy = velocityY.get();
        const magnitude = Math.sqrt(vx * vx + vy * vy);
        const bounce = Math.min(0.8, magnitude / 1000);
        animate(info.point.x, info.point.x + vx * 0.25, {
          type: 'spring',
          stiffness: 50,
          damping: 15,
          mass: 0.8,
          bounce,
        });
        animate(info.point.y, info.point.y + vy * 0.25, {
          type: 'spring',
          stiffness: 50,
          damping: 15,
          mass: 0.8,
          bounce,
        });
      }}
      style={{ rotateX, rotateY, opacity, willChange: 'transform' }}
      animate={controls}
      whileHover={{ scale: 1.02 }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={cn(
        'relative w-72 cursor-grab overflow-hidden rounded-2xl border border-border/70 bg-card p-5 shadow-2xl shadow-foreground/[0.12] ring-1 ring-inset ring-white/5 transform-3d active:cursor-grabbing',
        className,
      )}
    >
      {children}
      <motion.div
        style={{ opacity: glareOpacity }}
        className="pointer-events-none absolute inset-0 select-none bg-white"
      />
    </motion.div>
  );
}
