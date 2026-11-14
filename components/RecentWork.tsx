import Link from "next/link";
import { ArrowUpRight, Clock } from "lucide-react";

import { RECENT_WORK, type WorkItem } from "@/lib/business";

/**
 * "Recent work" — sits directly above Packages.
 *
 * The first card is a real build (this site). The other two are labelled
 * "Coming soon" and must stay that way until they actually exist: an honest
 * empty slot converts better than a fake portfolio.
 */
export default function RecentWork() {
  return (
    <section id="work" aria-labelledby="work-title">
      <div className="max-w-2xl">
        <span className="label">Recent work</span>
        <h2 id="work-title" className="section-title mt-2.5">
          Three things, built properly.
        </h2>
        <p className="section-lead mt-3">
          No logo wall. One live product and two builds in progress — you can
          check the first one yourself by using it.
        </p>
      </div>

      <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {RECENT_WORK.map((item) => (
          <WorkCard key={item.id} item={item} />
        ))}
      </div>
    </section>
  );
}

function WorkCard({ item }: { item: WorkItem }) {
  const live = item.status === "live";

  return (
    <article className="flex flex-col overflow-hidden rounded-2xl border border-espresso-900/10 bg-cream-50/70 transition hover:border-espresso-900/25 hover:bg-white/70">
      {live ? <BrowserMock /> : <ComingSoonMock title={item.title} />}

      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-display text-[15px] font-semibold leading-snug tracking-tight text-espresso-900">
            {item.title}
          </h3>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[8.5px] font-bold uppercase tracking-[0.1em] ${
              live
                ? "bg-sage-100 text-sage-500"
                : "bg-espresso-900/[0.06] text-espresso-500"
            }`}
          >
            {live ? "Live" : "Soon"}
          </span>
        </div>

        <p className="mt-1.5 text-[11.5px] leading-relaxed text-espresso-600">
          {item.summary}
        </p>

        <ul className="mt-3 flex flex-wrap gap-1">
          {item.tags.map((tag) => (
            <li
              key={tag}
              className="rounded-full border border-espresso-900/10 bg-white/60 px-2 py-0.5 text-[9.5px] font-medium text-espresso-500"
            >
              {tag}
            </li>
          ))}
        </ul>

        <div className="mt-auto pt-3.5">
          {live && item.href ? (
            <Link
              href={item.href}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-espresso-800 underline decoration-caramel-500/40 underline-offset-4 transition hover:decoration-caramel-500"
            >
              Try it
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-[10.5px] text-espresso-500">
              <Clock className="h-3 w-3" />
              In progress — case study soon
            </span>
          )}
        </div>
      </div>
    </article>
  );
}

/**
 * Stylised browser window rather than a screenshot: it renders instantly,
 * never goes stale, and keeps the page free of heavy images.
 */
function BrowserMock() {
  return (
    <div
      aria-hidden
      className="relative aspect-[16/10] overflow-hidden border-b border-espresso-900/10 bg-cream-100"
    >
      <div className="flex items-center gap-1.5 border-b border-espresso-900/10 bg-cream-50/90 px-2.5 py-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-espresso-900/15" />
        <span className="h-1.5 w-1.5 rounded-full bg-espresso-900/15" />
        <span className="h-1.5 w-1.5 rounded-full bg-espresso-900/15" />
        <span className="ml-1.5 truncate rounded-full bg-white/80 px-2 py-0.5 text-[8px] font-medium text-espresso-400">
          cafecaption.tech
        </span>
      </div>

      <div className="px-4 pt-3.5">
        <div className="mx-auto h-1 w-12 rounded-full bg-caramel-400/70" />
        <div className="mx-auto mt-2 h-2.5 w-[78%] rounded bg-espresso-900/75" />
        <div className="mx-auto mt-1.5 h-2.5 w-[52%] rounded bg-espresso-900/45" />
        <div className="mx-auto mt-2 h-1 w-[64%] rounded bg-espresso-900/15" />

        <div className="mt-3 rounded-lg border border-espresso-900/10 bg-white/85 p-2 shadow-sm">
          <div className="h-1 w-full rounded bg-espresso-900/10" />
          <div className="mt-1 h-1 w-[84%] rounded bg-espresso-900/10" />
          <div className="mt-1 h-1 w-[62%] rounded bg-espresso-900/10" />
          <div className="mt-2 flex gap-1">
            <span className="h-3 w-8 rounded bg-caramel-300/80" />
            <span className="h-3 w-9 rounded bg-caramel-200/80" />
            <span className="h-3 w-7 rounded bg-caramel-200/80" />
          </div>
        </div>

        <div className="mt-2 grid grid-cols-3 gap-1.5">
          <div className="h-6 rounded border border-espresso-900/[0.08] bg-white/60" />
          <div className="h-6 rounded border border-espresso-900/[0.08] bg-white/60" />
          <div className="h-6 rounded border border-espresso-900/[0.08] bg-white/60" />
        </div>
      </div>
    </div>
  );
}

function ComingSoonMock({ title }: { title: string }) {
  return (
    <div
      aria-hidden
      className="relative grid aspect-[16/10] place-items-center overflow-hidden border-b border-espresso-900/10 bg-[repeating-linear-gradient(135deg,rgba(43,26,18,0.035)_0_10px,transparent_10px_20px)]"
    >
      <div className="rounded-xl border border-dashed border-espresso-900/20 bg-cream-50/80 px-3 py-2 text-center">
        <span className="block text-[9px] font-bold uppercase tracking-[0.14em] text-espresso-400">
          Coming soon
        </span>
        <span className="mt-0.5 block max-w-[140px] truncate text-[9.5px] text-espresso-500">
          {title}
        </span>
      </div>
    </div>
  );
}
