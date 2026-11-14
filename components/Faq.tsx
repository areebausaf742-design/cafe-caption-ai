import { Plus } from "lucide-react";

import { FAQS } from "@/lib/business";

export default function Faq() {
  return (
    <section id="faq" aria-labelledby="faq-title">
      <div className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr] lg:gap-12">
        <div>
          <span className="label">FAQ</span>
          <h2 id="faq-title" className="section-title mt-2.5">
            Questions café owners ask.
          </h2>
          <p className="section-lead mt-3">
            If yours isn&apos;t here, send a WhatsApp — you&apos;ll get a real
            answer, not a sales deck.
          </p>
        </div>

        <div className="divide-y divide-espresso-900/10 border-y border-espresso-900/10">
          {FAQS.map((faq) => (
            <details key={faq.q} className="group py-3.5">
              <summary className="flex cursor-pointer list-none items-start justify-between gap-4 text-[13px] font-semibold leading-snug text-espresso-900 transition hover:text-espresso-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caramel-500/40 [&::-webkit-details-marker]:hidden">
                {faq.q}
                <Plus className="mt-0.5 h-3.5 w-3.5 shrink-0 text-espresso-400 transition-transform duration-200 group-open:rotate-45" />
              </summary>
              <p className="mt-2 max-w-xl pr-8 text-[12.5px] leading-relaxed text-espresso-600">
                {faq.a}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
