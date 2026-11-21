"use client";

import Link from "next/link";
import { useEffect } from "react";

/**
 * The route-level error boundary.
 *
 * `next` shows a raw stack in development and an unstyled "Application error" in
 * production, which is both ugly and unhelpful: the visitor cannot tell whether
 * their menu was lost. This one says what happened, keeps the tab on the site,
 * and offers the two actions that actually work — retry the render, or leave.
 *
 * What is *not* shown: the error message, the digest or the stack. A server error
 * can carry a database snippet or a request fragment, and this page is public.
 */

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The digest is Next's hash of the server-side stack — enough to find the
    // real error in the platform logs, and safe to write to a browser console.
    console.error(
      `[app] render failed${error.digest ? ` (digest ${error.digest})` : ""}`,
    );
  }, [error]);

  return (
    <main id="main" tabIndex={-1} className="mx-auto w-full max-w-2xl px-4 py-20 sm:px-6">
      <p className="label">Something broke</p>

      <h1 className="mt-4 font-display text-[1.9rem] font-semibold leading-[1.1] tracking-[-0.02em] text-espresso-900 sm:text-[2.4rem]">
        That did not load. Nothing you saved was lost.
      </h1>

      <p className="section-lead mt-4 max-w-md">
        Menus, prices and the WhatsApp handoff all live on our servers, not in this
        tab, so a failed render cannot delete them. Try once more — if it keeps
        failing, the WhatsApp button below still reaches a person.
      </p>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <button type="button" onClick={reset} className="btn-primary min-h-[44px]">
          Try again
        </button>
        <Link href="/" className="btn-outline min-h-[44px]">
          Back to the studio
        </Link>
      </div>

      <p className="mt-8 text-[11.5px] leading-[1.7] text-espresso-500">
        Still stuck?{" "}
        <Link href="/#contact" className="underline underline-offset-2 hover:text-espresso-800">
          Send a message
        </Link>{" "}
        and mention what you were doing — it helps us fix it faster.
      </p>
    </main>
  );
}
