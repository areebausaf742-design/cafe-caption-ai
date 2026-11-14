"use client";

import { useMemo, useState } from "react";
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  MessageCircle,
} from "lucide-react";

import { track } from "@/lib/analytics";
import { CONTACT_NAME, whatsappUrl } from "@/lib/business";
import { INTERESTS, type Interest } from "@/lib/leads";

/**
 * "Get a quote in 24h" form.
 *
 * No database, no backend call: on submit it opens WhatsApp with the visitor's
 * name, café, city and what they need already written out. They press send —
 * the enquiry is a normal chat, which is how a café owner actually replies.
 */

interface FormState {
  name: string;
  cafeName: string;
  city: string;
  interest: Interest;
  message: string;
  company: string; // honeypot — bots fill it, humans never see it
}

const EMPTY: FormState = {
  name: "",
  cafeName: "",
  city: "",
  interest: "not-sure",
  message: "",
  company: "",
};

export default function LeadForm() {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [sentUrl, setSentUrl] = useState<string | null>(null);

  const interestLabel = useMemo(
    () => INTERESTS.find((option) => option.id === form.interest)?.label ?? "",
    [form.interest],
  );

  const update =
    (key: keyof FormState) =>
    (
      event: React.ChangeEvent<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >,
    ) => {
      setForm((current) => ({ ...current, [key]: event.target.value }));
      if (error) setError(null);
    };

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (form.company) return; // honeypot tripped — silently ignore

    const name = form.name.trim();
    const cafeName = form.cafeName.trim();
    const city = form.city.trim();

    if (!name || !cafeName || !city) {
      setError("Add your name, café and city so I can reply properly.");
      return;
    }

    const lines = [
      `Hi ${CONTACT_NAME}, I'd like a quote for my café.`,
      `Name: ${name}`,
      `Café: ${cafeName}`,
      `City: ${city}`,
      `Looking for: ${interestLabel}`,
      form.message.trim() ? `Notes: ${form.message.trim()}` : null,
    ].filter((line): line is string => Boolean(line));

    const url = whatsappUrl(lines.join("\n"));

    track({ name: "lead_submit", props: { interest: form.interest } });
    setSentUrl(url);

    // The submit is a real user gesture, so this is allowed to open a tab.
    window.open(url, "_blank", "noopener,noreferrer");
  };

  if (sentUrl) {
    return (
      <div className="card flex h-full flex-col justify-center p-4 text-center sm:p-6">
        <span className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-sage-100">
          <Check className="h-5 w-5 text-sage-500" />
        </span>
        <h3 className="mt-3 font-display text-xl font-semibold tracking-tight text-espresso-900">
          Your message is ready.
        </h3>
        <p className="mx-auto mt-1.5 max-w-sm text-[12.5px] leading-relaxed text-espresso-600">
          WhatsApp should have opened with everything filled in — just press
          send. You&apos;ll get a fixed price back within 24 hours.
        </p>

        <a
          href={sentUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mx-auto mt-4 inline-flex items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-2.5 text-[12.5px] font-semibold text-[#06281A] transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#25D366]/60"
        >
          <MessageCircle className="h-4 w-4" />
          Open WhatsApp
          <ArrowUpRight className="h-3.5 w-3.5" />
        </a>

        <p className="mx-auto mt-2 max-w-xs text-[10.5px] leading-relaxed text-espresso-500">
          Nothing opened? Tap the button above — the message is saved.
        </p>

        <button
          type="button"
          onClick={() => {
            setForm(EMPTY);
            setSentUrl(null);
          }}
          className="mx-auto mt-3 text-[11px] text-espresso-500 underline-offset-2 hover:text-espresso-800 hover:underline"
        >
          Send another enquiry
        </button>
      </div>
    );
  }

  return (
    <div className="card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-[19px] font-semibold leading-tight tracking-tight text-espresso-900">
            Get a quote in 24h
          </h3>
          <p className="mt-1 text-[11.5px] leading-relaxed text-espresso-600">
            Four answers is enough. It opens a WhatsApp message with your
            details already written.
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-caramel-300/70 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-espresso-900">
          24h
        </span>
      </div>

      <form onSubmit={submit} className="mt-3.5 space-y-2.5">
        <div className="grid gap-2.5 sm:grid-cols-2">
          <Field label="Your name" htmlFor="quote-name">
            <input
              id="quote-name"
              required
              value={form.name}
              onChange={update("name")}
              autoComplete="name"
              placeholder="Areeb"
              className="input"
              maxLength={80}
            />
          </Field>

          <Field label="Café name" htmlFor="quote-cafe">
            <input
              id="quote-cafe"
              required
              value={form.cafeName}
              onChange={update("cafeName")}
              autoComplete="organization"
              placeholder="The Daily Grind"
              className="input"
              maxLength={80}
            />
          </Field>

          <Field label="City" htmlFor="quote-city">
            <input
              id="quote-city"
              required
              value={form.city}
              onChange={update("city")}
              autoComplete="address-level2"
              placeholder="Lucknow"
              className="input"
              maxLength={40}
            />
          </Field>

          <Field label="What do you need?" htmlFor="quote-interest">
            <div className="relative">
              <select
                id="quote-interest"
                value={form.interest}
                onChange={update("interest")}
                className="input appearance-none pr-9"
              >
                {INTERESTS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-espresso-400" />
            </div>
          </Field>
        </div>

        <Field label="Anything else? (optional)" htmlFor="quote-message">
          <textarea
            id="quote-message"
            value={form.message}
            onChange={update("message")}
            rows={3}
            maxLength={600}
            placeholder="We're a 20-seat café in Hazratganj — need a menu and Instagram help before Diwali."
            className="field min-h-[76px]"
          />
        </Field>

        {/* Honeypot — hidden from people, tempting to bots */}
        <div aria-hidden className="hidden">
          <label htmlFor="quote-company">Company</label>
          <input
            id="quote-company"
            tabIndex={-1}
            autoComplete="off"
            value={form.company}
            onChange={update("company")}
          />
        </div>

        {error && (
          <p
            role="alert"
            className="rounded-lg border border-[#E4C6B8] bg-[#FBEEE8] px-3 py-2 text-[11.5px] font-medium leading-relaxed text-[#7A3520]"
          >
            {error}
          </p>
        )}

        <button type="submit" className="btn-primary mt-1">
          <MessageCircle className="h-3.5 w-3.5" />
          Get my quote on WhatsApp
        </button>

        <p className="text-center text-[10.5px] leading-relaxed text-espresso-500">
          Opens WhatsApp with your details filled in — nothing is stored on this
          site.
        </p>
      </form>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <label
        htmlFor={htmlFor}
        className="mb-1 block text-[9.5px] font-semibold uppercase tracking-[0.14em] text-espresso-500"
      >
        {label.replace(" (optional)", "")}
        {label.includes("optional") && (
          <span className="ml-1 font-normal normal-case tracking-normal text-espresso-400">
            optional
          </span>
        )}
      </label>
      {children}
    </div>
  );
}
