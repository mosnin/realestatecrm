/**
 * `/research`, placeholder for the research story (how Chippi was built on
 * comprehensive real-estate research). Intentionally a stub for now; linked from
 * the homepage research section. Renders in the adaptive marketing shell.
 */

export const metadata = {
  title: 'Research · Chippi',
  description: 'How we built Chippi on comprehensive research into how real-estate agents actually work.',
};

export default function ResearchPage() {
  return (
    <section className="mx-auto flex min-h-[70vh] max-w-3xl flex-col items-center justify-center px-5 py-40 text-center sm:px-8">
      <span
        style={{ fontFamily: 'var(--font-mono)' }}
        className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.22em] text-neutral-500 dark:text-white/55"
      >
        <span className="inline-block size-1.5 rounded-full bg-[#ff7a45]" />
        Research
      </span>
      <h1 className="mt-6 text-[clamp(2.5rem,6vw,4rem)] leading-[1.04] tracking-[-0.02em] text-neutral-900 dark:text-white">
        How we built Chippi.
      </h1>
      <p className="mt-5 max-w-md text-base leading-relaxed text-neutral-600 dark:text-white/55">
        The full story, hundreds of agent interviews, shadowed deals, and the workflows that shaped
        every feature, is on the way.
      </p>
    </section>
  );
}
