"use client";

import { useMemo, useState } from "react";
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  Loader2,
  MessageCircle,
  Send,
} from "lucide-react";

import { whatsappUrl } from "@/lib/business";
import { INTERESTS, type Interest } from "@/lib/leads";

interface FormState {
  name: string;
  cafeName: string;
  city: string;
  whatsapp: string;
  email: string;
  interest: Interest;
  message: string;
  company: string; // honeypot
}

const EMPTY: FormState = {
  name: "",
  cafeName: "",
  city: "",
  whatsapp: "",
  email: "",
  interest: "not-sure",
  message: "",
  company: "",
};

type Status = "idle" | "sending" | "sent" | "error";

export default function LeadForm() {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [stored, setStored] = useState(false);

  const interestLabel = useMemo(
    () => INTERESTS.find((option) => option.id === form.interest)?.label ?? "",
    [form.interest],
  );

  const handoffUrl = useMemo(() => {
    const lines = [
      "New enquiry from the website",
      `Name: ${form.name}`,
      `Café: ${form.cafeName}${form.city ? ` (${form.city})` : ""}`,
      form.whatsapp ? `WhatsApp: ${form.whatsapp}` : "",
      form.email ? `Email: ${form.email}` : "",
      interestLabel ? `Interested in: ${interestLabel}` : "",
      form.message ? `Notes: ${form.message}` : "",
    ].filter(Boolean);

    return whatsappUrl(lines.join("\n"));
  }, [form, interestLabel]);

  const update = (key: keyof FormState) => (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => {
    setForm((current) => ({ ...current, [key]: event.target.value }));
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (status === "sending") return;

    setStatus("sending");
    setError(null);

    try {
      const response = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        const payload = data as { error?: string } | null;
        setError(
          payload?.error ??
            "That didn't go through. Please try WhatsApp or email instead.",
        );
        setStatus("error");
        return;
      }

      setStored(Boolean((data as { stored?: boolean } | null)?.stored));
      setStatus("sent");
    } catch {
      setError(
        "Network hiccup — please try again, or message on WhatsApp below.",
      );
      setStatus("error");
    }
  };

  return (
    <div className="card p-4 sm:p-6">
      {status === "sent" ? (
        <div className="flex h-full flex-col justify-center py-4 text-center">
          <span className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-sage-100">
            <Check className="h-5 w-5 text-sage-500" />
          </span>
          <h3 className="mt-3 font-display text-xl font-semibold tracking-tight text-espresso-900">
            Thanks{form.name ? `, ${form.name.split(" ")[0]}` : ""}.
          </h3>
          <p className="mx-auto mt-1.5 max-w-sm text-[12.5px] leading-relaxed text-espresso-600">
            {stored
              ? "Your enquiry is in. I'll reply on WhatsApp, usually within a few hours."
              : "Your details are ready to send. Tap below and I'll reply on WhatsApp, usually within a few hours."}
          </p>

          <a
            href={handoffUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mx-auto mt-4 inline-flex items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-2.5 text-[12.5px] font-semibold text-[#06281A] transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#25D366]/60"
          >
            <MessageCircle className="h-4 w-4" />
            Send it on WhatsApp
            <ArrowUpRight className="h-3.5 w-3.5" />
          </a>

          <button
            type="button"
            onClick={() => {
              setForm(EMPTY);
              setStatus("idle");
              setStored(false);
            }}
            className="mx-auto mt-3 text-[11px] text-espresso-500 underline-offset-2 hover:text-espresso-800 hover:underline"
          >
            Send another enquiry
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-2.5">
          <div className="grid gap-2.5 sm:grid-cols-2">
            <Field label="Your name" htmlFor="lead-name">
              <input
                id="lead-name"
                required
                value={form.name}
                onChange={update("name")}
                autoComplete="name"
                placeholder="Areeb"
                className="input"
                maxLength={80}
              />
            </Field>

            <Field label="WhatsApp number" htmlFor="lead-whatsapp">
              <input
                id="lead-whatsapp"
                required
                type="tel"
                inputMode="tel"
                value={form.whatsapp}
                onChange={update("whatsapp")}
                autoComplete="tel"
                placeholder="+91 98765 43210"
                className="input"
                maxLength={20}
              />
            </Field>

            <Field label="Café name" htmlFor="lead-cafe">
              <input
                id="lead-cafe"
                required
                value={form.cafeName}
                onChange={update("cafeName")}
                autoComplete="organization"
                placeholder="The Daily Grind"
                className="input"
                maxLength={80}
              />
            </Field>

            <Field label="City" htmlFor="lead-city">
              <input
                id="lead-city"
                required
                value={form.city}
                onChange={update("city")}
                autoComplete="address-level2"
                placeholder="Lucknow"
                className="input"
                maxLength={40}
              />
            </Field>

            <Field label="Email (optional)" htmlFor="lead-email">
              <input
                id="lead-email"
                type="email"
                value={form.email}
                onChange={update("email")}
                autoComplete="email"
                placeholder="you@cafe.com"
                className="input"
                maxLength={120}
              />
            </Field>

            <Field label="Interested in" htmlFor="lead-interest">
              <div className="relative">
                <select
                  id="lead-interest"
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

          <Field label="Anything else? (optional)" htmlFor="lead-message">
            <textarea
              id="lead-message"
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
            <label htmlFor="lead-company">Company</label>
            <input
              id="lead-company"
              tabIndex={-1}
              autoComplete="off"
              value={form.company}
              onChange={update("company")}
            />
          </div>

          {status === "error" && error && (
            <p
              role="alert"
              className="rounded-lg border border-[#E4C6B8] bg-[#FBEEE8] px-3 py-2 text-[11.5px] font-medium leading-relaxed text-[#7A3520]"
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={status === "sending"}
            className="btn-primary mt-1"
          >
            {status === "sending" ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Sending…
              </>
            ) : (
              <>
                <Send className="h-3.5 w-3.5" />
                Request a callback
              </>
            )}
          </button>

          <p className="text-center text-[10.5px] leading-relaxed text-espresso-500">
            Used only to reply to you. No lists, no spam.
          </p>
        </form>
      )}
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
