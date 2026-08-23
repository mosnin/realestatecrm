'use client';

import { Inbox, Gauge, MessageSquareText, CalendarCheck, ShieldCheck } from 'lucide-react';
import { Band, BlurRise, Eyebrow, Serif } from './primitives';
import { HOME_DICTS } from '@/lib/i18n/dictionaries/home';
import type { Lang } from '@/lib/i18n/markets';

const ICONS = [Inbox, Gauge, MessageSquareText, CalendarCheck];

export function HomeMechanism({ lang = 'en' }: { lang?: Lang }) {
  const t = HOME_DICTS[lang].mechanism;

  return (
    <Band className="py-24 sm:py-32">
      <BlurRise className="mx-auto max-w-3xl text-center">
        <Eyebrow className="justify-center">{t.eyebrow}</Eyebrow>
        <Serif className="mt-5 text-[clamp(2rem,4vw,3.5rem)] leading-[1.04] text-white">
          {t.headline}
        </Serif>
        <p className="mx-auto mt-5 max-w-xl text-[15px] leading-relaxed text-white/55">{t.sub}</p>
      </BlurRise>

      <div className="mx-auto mt-14 grid max-w-5xl gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {t.items.map((item, index) => {
          const Icon = ICONS[index];
          return (
            <BlurRise key={item.title} delay={index * 0.05}>
              <div className="h-full rounded-3xl border border-white/[0.08] bg-white/[0.025] p-6">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04]">
                  <Icon className="h-[18px] w-[18px]" stroke="url(#chippi-grad)" strokeWidth={1.7} />
                </span>
                <h3 className="mt-5 text-[16px] font-medium text-white">{item.title}</h3>
                <p className="mt-2 text-[13px] leading-relaxed text-white/55">{item.desc}</p>
              </div>
            </BlurRise>
          );
        })}
      </div>

      <BlurRise delay={0.14} className="mx-auto mt-6 max-w-5xl">
        <div className="flex items-start gap-3 rounded-2xl border border-[#ff7a45]/20 bg-[#ff7a45]/[0.06] px-5 py-4 text-[13px] leading-relaxed text-white/65">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#ff9a6e]" />
          <p>{t.control}</p>
        </div>
      </BlurRise>
    </Band>
  );
}
