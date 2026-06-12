/**
 * BreadthBand, the "more than the inbox" beat (audit fix: breadth should read
 * as an agentic OS, not a follow-up tool). Four real, under-told capabilities,
 * framed honestly:
 *
 * - Voice: realtime voice chat + Whisper + TTS (conversational, NOT outbound
 *   calling, copy says you talk to Chippi).
 * - Deep work: delegate_task spawns a swarm research session with live
 *   progress (research/observe, the sub-agents don't mutate the workspace).
 * - Memory: store/recall_memory keeps weighted observations.
 * - Agent-editable capture: add_intake_question rewrites the live form.
 *
 * White open grid, two-tone headline.
 */

import { Brain, ListChecks, Mic, Telescope } from 'lucide-react';
import { TwoTone } from './two-tone';
import { EyebrowChip, FadeUp, Stagger, StaggerItem } from '@/components/marketing/site/section';

const CELLS = [
  {
    icon: Mic,
    title: 'Talk to Chippi.',
    body: 'Speak instead of type. Chippi listens, answers, and works the task hands-free between showings.',
  },
  {
    icon: Telescope,
    title: 'Deep work on demand.',
    body: 'Hand Chippi a research job and it spins up a focused work session, streaming progress while it digs.',
  },
  {
    icon: Brain,
    title: 'A second brain.',
    body: 'Chippi remembers what matters: who went quiet, how you like to write, the context behind every deal.',
  },
  {
    icon: ListChecks,
    title: 'Capture that edits itself.',
    body: 'Ask Chippi to add a question to your intake form and it rewrites the live form. No builder, no dev.',
  },
];

export function BreadthBand() {
  return (
    <section className="mx-auto max-w-7xl px-4 sm:px-6">
      <FadeUp className="mx-auto max-w-2xl text-center">
        <EyebrowChip className="justify-center">Beyond the inbox</EyebrowChip>
        <h2 className="mt-5 text-4xl font-semibold leading-[1.05] sm:text-5xl">
          <TwoTone parts={[{ t: 'Not a' }, { t: 'follow-up tool.', dim: true }, { t: 'An' }, { t: 'operating system.', dim: true }]} />
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-neutral-600 sm:text-lg">
          The inbox loop is where it starts. Chippi runs across your whole day,
          by voice, on deep work, with a memory of every deal.
        </p>
      </FadeUp>

      <Stagger className="mt-12 grid gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-4">
        {CELLS.map((c) => (
          <StaggerItem key={c.title} className="h-full">
            <div className="h-full rounded-3xl bg-white p-7 shadow-[0_18px_60px_-24px_rgba(20,20,40,0.12)] ring-1 ring-black/5">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#ff4b29]/10">
                <c.icon className="h-4 w-4 text-[#ff4b29]" />
              </div>
              <h3 className="mt-5 text-xl font-semibold tracking-tight text-zinc-950">{c.title}</h3>
              <p className="mt-3 text-base leading-relaxed text-neutral-500">{c.body}</p>
            </div>
          </StaggerItem>
        ))}
      </Stagger>
    </section>
  );
}
