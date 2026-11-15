import BookingLink from "@/components/BookingLink";
import Reveal from "@/components/motion/Reveal";
import { PROCESS_STEPS } from "@/lib/business";

export default function Process() {
  return (
    <section id="process" aria-labelledby="process-title">
      <Reveal>
        <div className="max-w-2xl">
          <span className="label">How it works</span>
          <h2 id="process-title" className="section-title mt-3">
            Three steps, no guesswork.
          </h2>
        </div>
      </Reveal>

      <ol className="mt-8 grid gap-6 sm:grid-cols-3 sm:gap-7">
        {PROCESS_STEPS.map((step, index) => (
          <Reveal as="li" key={step.title} delay={index * 110} className="relative">
            <div className="flex items-baseline gap-2">
              <span className="font-display text-[13px] font-semibold tabular-nums text-caramel-600">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="h-px flex-1 bg-gradient-to-r from-espresso-900/20 to-espresso-900/[0.04]" />
            </div>
            <h3 className="mt-3 font-display text-[16px] font-semibold leading-snug tracking-[-0.01em] text-espresso-900">
              {step.title}
            </h3>
            <p className="mt-2 text-[12.5px] leading-[1.68] text-espresso-600">
              {step.body}
            </p>
          </Reveal>
        ))}
      </ol>

      <p className="mt-7 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12px] leading-[1.65] text-espresso-600">
        Prefer to talk before committing?
        <BookingLink
          location="process"
          variant="inline"
          label="Book a free 20-minute call"
        />
      </p>
    </section>
  );
}
