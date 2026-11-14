import { PROCESS_STEPS } from "@/lib/business";

export default function Process() {
  return (
    <section id="process" aria-labelledby="process-title">
      <div className="max-w-2xl">
        <span className="label">How it works</span>
        <h2 id="process-title" className="section-title mt-2.5">
          Three steps, no guesswork.
        </h2>
      </div>

      <ol className="mt-7 grid gap-5 sm:grid-cols-3 sm:gap-6">
        {PROCESS_STEPS.map((step, index) => (
          <li key={step.title} className="relative">
            <div className="flex items-baseline gap-2">
              <span className="font-display text-[13px] font-semibold tabular-nums text-caramel-600">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="h-px flex-1 bg-espresso-900/15" />
            </div>
            <h3 className="mt-2.5 font-display text-[15px] font-semibold leading-snug text-espresso-900">
              {step.title}
            </h3>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-espresso-600">
              {step.body}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}
