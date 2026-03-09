'use client';

import React, { useRef, useState } from 'react';
import { motion } from 'motion/react';

import { navLinks } from '@/lib/nav-links';

interface NavItem {
  id: number;
  name: string;
  href: string;
}

const navs: NavItem[] = [...navLinks];

export function NavMenu() {
  const ref = useRef<HTMLUListElement>(null);
  const [left, setLeft] = useState(0);
  const [width, setWidth] = useState(0);
  const [isReady, setIsReady] = useState(false);
  const [activeSection, setActiveSection] = useState('hero');
  const [isManualScroll, setIsManualScroll] = useState(false);

  React.useEffect(() => {
    const firstItem = ref.current?.querySelector(`[href="#${navs[0].href.substring(1)}"]`)?.parentElement;
    if (firstItem) {
      const rect = firstItem.getBoundingClientRect();
      setLeft(firstItem.offsetLeft);
      setWidth(rect.width);
      setIsReady(true);
    }
  }, []);

  React.useEffect(() => {
    const handleScroll = () => {
      if (isManualScroll) return;

      const sections = navs.map((item) => item.href.substring(1));
      let closestSection = sections[0];
      let minDistance = Infinity;

      for (const section of sections) {
        const element = document.getElementById(section);
        if (element) {
          const rect = element.getBoundingClientRect();
          const distance = Math.abs(rect.top - 100);
          if (distance < minDistance) {
            minDistance = distance;
            closestSection = section;
          }
        }
      }

      setActiveSection(closestSection);
      const navItem = ref.current?.querySelector(`[href="#${closestSection}"]`)?.parentElement;
      if (navItem) {
        const rect = navItem.getBoundingClientRect();
        setLeft(navItem.offsetLeft);
        setWidth(rect.width);
      }
    };

    window.addEventListener('scroll', handleScroll);
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, [isManualScroll]);

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>, item: NavItem) => {
    e.preventDefault();

    const targetId = item.href.substring(1);
    const element = document.getElementById(targetId);

    if (element) {
      setIsManualScroll(true);
      setActiveSection(targetId);

      const navItem = e.currentTarget.parentElement;
      if (navItem) {
        const rect = navItem.getBoundingClientRect();
        setLeft(navItem.offsetLeft);
        setWidth(rect.width);
      }

      const elementPosition = element.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - 100;

      window.scrollTo({ top: offsetPosition, behavior: 'smooth' });

      setTimeout(() => {
        setIsManualScroll(false);
      }, 500);
    }
  };

  return (
    <div className="hidden w-full md:block">
      <ul
        className="relative mx-auto flex h-11 w-fit items-center justify-center rounded-full px-2"
        ref={ref}
      >
        {navs.map((item) => (
          <li
            key={item.id}
            className={`tracking-tight z-10 flex h-full cursor-pointer items-center justify-center px-4 py-2 text-sm font-medium transition-colors duration-200 ${
              activeSection === item.href.substring(1)
                ? 'text-primary'
                : 'text-primary/60 hover:text-primary'
            }`}
          >
            <a href={item.href} onClick={(e) => handleClick(e, item)}>
              {item.name}
            </a>
          </li>
        ))}
        {isReady && (
          <motion.li
            animate={{ left, width }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="bg-accent/60 border-border absolute inset-0 my-1.5 rounded-full border"
          />
        )}
      </ul>
    </div>
  );
}
