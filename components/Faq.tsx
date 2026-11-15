import { Plus } from "lucide-react";

import Reveal from "@/components/motion/Reveal";
import { FAQS } from "@/lib/business";

export default function Faq() {
  return (
    <section id="faq" aria-labelledby="faq-title">
      <div className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:gap-14">
        <Reveal>
          <span className="label">FAQ</span>
          <h2 id="faq-title" className="section-title mt-3">
            Questions café owners ask.
          </h2>
          <p className="section-lead mt-4">
            If yours isn&apos;t here, send a WhatsApp — you&apos;ll get a real
            answer, not a sales deck.
          </p>
        </Reveal>

        <Reveal delay={90}>
          <div className="divide-y divide-espresso-900/[0.08] border-y border-espresso-900/[0.08]">
            {FAQS.map((faq) => (
              <details key={faq.q} className="group py-1">
                <summary className="flex min-h-[52px] cursor-pointer list-none items-center justify-between gap-4 text-[13.5px] font-semibold leading-[1.55] text-espresso-900 transition hover:text-espresso-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caramel-500/40 [&::-webkit-details-marker]:hidden">
                  {faq.q}
                  <Plus className="mt-0.5 h-3.5 w-3.5 shrink-0 text-espresso-400 transition-transform duration-200 group-open:rotate-45" />
                </summary>
                <p className="mt-1 max-w-xl pb-4 pr-8 text-[12.5px] leading-[1.7] text-espresso-600">
                  {faq.a}
                </p>
              </details>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
