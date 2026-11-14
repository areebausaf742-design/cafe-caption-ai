/**
 * Lead form contract shared by the client form and /api/leads.
 * No secrets here — safe to import anywhere.
 */

export const INTERESTS = [
  { id: "launch-kit", label: "Website + full setup" },
  { id: "caption-vault", label: "Captions only" },
  { id: "signature", label: "Website + ongoing content" },
  { id: "ai-bot", label: "WhatsApp caption bot" },
  { id: "not-sure", label: "Not sure yet" },
] as const;

export type Interest = (typeof INTERESTS)[number]["id"];

export interface LeadInput {
  name: string;
  cafeName: string;
  city: string;
  whatsapp: string;
  email?: string;
  interest: Interest;
  message?: string;
  /** Honeypot — must stay empty. Bots fill it; humans never see it. */
  company?: string;
}

export interface LeadDraft {
  name: string;
  cafe_name: string;
  city: string;
  whatsapp: string;
  email: string | null;
  interest: string;
  message: string | null;
}

export type LeadValidation =
  | { ok: true; value: LeadDraft }
  | { ok: false; error: string; field?: keyof LeadInput };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

function text(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Keep digits only, cap at E.164 length. */
export function normalizePhone(value: string): string {
  const digits = value.replace(/[^\d]/g, "");
  return digits.slice(0, 15);
}

export function validateLead(input: unknown): LeadValidation {
  if (typeof input !== "object" || input === null) {
    return { ok: false, error: "Please fill in the form." };
  }

  const raw = input as Record<string, unknown>;

  // Honeypot: silently accept-looking, but reject so bots get nothing useful.
  if (text(raw.company).length > 0) {
    return { ok: false, error: "Something went wrong. Please try again." };
  }

  const name = text(raw.name).slice(0, 80);
  if (name.length < 2) {
    return { ok: false, error: "Please add your name.", field: "name" };
  }

  const cafeName = text(raw.cafeName).slice(0, 80);
  if (cafeName.length < 2) {
    return {
      ok: false,
      error: "Please add your café's name.",
      field: "cafeName",
    };
  }

  const city = text(raw.city).slice(0, 40);
  if (city.length < 2) {
    return { ok: false, error: "Please add your city.", field: "city" };
  }

  const whatsapp = normalizePhone(text(raw.whatsapp));
  if (whatsapp.length < 8) {
    return {
      ok: false,
      error: "Please add a WhatsApp number we can reach you on.",
      field: "whatsapp",
    };
  }

  const email = text(raw.email).slice(0, 120);
  if (email && !EMAIL_RE.test(email)) {
    return { ok: false, error: "That email doesn't look right.", field: "email" };
  }

  const interest = INTERESTS.some((option) => option.id === raw.interest)
    ? (raw.interest as Interest)
    : "not-sure";

  const message = text(raw.message).slice(0, 600);

  return {
    ok: true,
    value: {
      name,
      cafe_name: cafeName,
      city,
      whatsapp,
      email: email || null,
      interest,
      message: message || null,
    },
  };
}
