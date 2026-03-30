'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';

const COLORS = ['#ff964f', '#ffb347', '#ff6f3c', '#ffd700', '#ff4500', '#ffa07a', '#e8e8e8', '#ffffff'];

interface Particle {
  id: number;
  x: number;
  y: number;
  rotation: number;
  scale: number;
  color: string;
  delay: number;
  drift: number;
  shape: 'rect' | 'circle';
}

function createParticles(count: number): Particle[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: -10 - Math.random() * 20,
    rotation: Math.random() * 720 - 360,
    scale: 0.4 + Math.random() * 0.8,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    delay: Math.random() * 0.6,
    drift: (Math.random() - 0.5) * 40,
    shape: Math.random() > 0.5 ? 'rect' : 'circle',
  }));
}

interface ConfettiProps {
  /** Whether confetti is currently active */
  active: boolean;
  /** Number of confetti particles (default 60) */
  count?: number;
  /** Duration in ms before auto-hiding (default 3000) */
  duration?: number;
}

export function Confetti({ active, count = 60, duration = 3000 }: ConfettiProps) {
  const [particles, setParticles] = useState<Particle[]>([]);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (active) {
      setParticles(createParticles(count));
      setVisible(true);
      const timer = setTimeout(() => setVisible(false), duration);
      return () => clearTimeout(timer);
    }
  }, [active, count, duration]);

  return (
    <AnimatePresence>
      {visible && (
        <div className="pointer-events-none fixed inset-0 z-[9999] overflow-hidden">
          {particles.map((p) => (
            <motion.div
              key={p.id}
              initial={{
                left: `${p.x}%`,
                top: `${p.y}%`,
                rotate: 0,
                scale: 0,
                opacity: 1,
              }}
              animate={{
                top: `${100 + Math.random() * 20}%`,
                left: `${p.x + p.drift}%`,
                rotate: p.rotation,
                scale: p.scale,
                opacity: [1, 1, 0],
              }}
              exit={{ opacity: 0 }}
              transition={{
                duration: 2 + Math.random() * 1.5,
                delay: p.delay,
                ease: [0.25, 0.46, 0.45, 0.94],
              }}
              className="absolute"
              style={{
                width: p.shape === 'rect' ? 8 : 7,
                height: p.shape === 'rect' ? 12 : 7,
                backgroundColor: p.color,
                borderRadius: p.shape === 'circle' ? '50%' : '1px',
              }}
            />
          ))}
        </div>
      )}
    </AnimatePresence>
  );
}
