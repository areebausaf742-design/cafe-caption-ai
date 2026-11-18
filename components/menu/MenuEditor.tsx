"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  AlertCircle,
  Check,
  Copy,
  ExternalLink,
  Languages,
  Loader2,
  Plus,
  Rotate3d,
  Trash2,
} from "lucide-react";

import MenuQr from "@/components/menu/MenuQr";
import { hasModel, modelCount } from "@/lib/dish";
import {
  applyDishSuggestion,
  setItemDish,
  setItemModel,
} from "@/lib/menu-draft";
import {
  MAX_CATEGORY,
  MAX_ITEM_NAME,
  MAX_ITEMS,
  MAX_PRICE,
  MAX_TAGLINE,
  menuPath,
  type MenuDoc,
  type MenuDraft,
} from "@/lib/menu";
import {
  missingTranslations,
  pruneStaleTranslations,
  stitchTranslations,
  translatableLines,
} from "@/lib/menu-translate";
import { requestTranslations } from "@/lib/studio-client";
import type { MenuItem } from "@/lib/types";

/**
 * The editor behind a published menu.
 *
 * There's no login: the capability key lives in the URL fragment, this component
 * reads it once and sends it as a header. If someone shares the link, they share
 * the ability to edit — so the page says so in as many words rather than
 * pretending otherwise.
 */

/**
 * Operator switch. Off by default: cafés never see a file format or a URL. Set
 * NEXT_PUBLIC_DISH_MANUAL_MODEL=1 to reveal plain GLB fields for demos.
 */
const MANUAL_MODELS = process.env.NEXT_PUBLIC_DISH_MANUAL_MODEL === "1";

/** Same panel the homepage uses, fetched only when it's actually on screen. */
const DishStudio = dynamic(() => import("@/components/menu/DishStudio"), {
  ssr: false,
  loading: () => null,
});

type Phase = "loading" | "ready" | "error";

type Draft = MenuDraft;

function toDraft(doc: MenuDoc): Draft {
  return {
    cafeName: doc.cafeName,
    tagline: doc.tagline,
    whatsapp: doc.whatsapp,
    items: doc.items.map((item) => ({ ...item })),
    published: doc.published,
  };
}

export default function MenuEditor({ slug }: { slug: string }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [problem, setProblem] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saved, setSaved] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [copied, setCopied] = useState<"menu" | "editor" | null>(null);
  const [translating, setTranslating] = useState(false);
  const [translateNote, setTranslateNote] = useState<string | null>(null);

  const keyRef = useRef<string>("");
  const [origin, setOrigin] = useState("");

  /* ------------------------------- load ---------------------------------- */

  useEffect(() => {
    setOrigin(window.location.origin);
    keyRef.current = window.location.hash.replace(/^#/, "");
  }, []);

  useEffect(() => {
    const key = keyRef.current;
    if (!key) {
      setPhase("error");
      setProblem(
        "This editor link is missing its key. Use the full link you were given when the menu was published — the part after the # is the key, and it can't be recovered.",
      );
      return;
    }

    let active = true;

    (async () => {
      try {
        const response = await fetch(`/api/menus/${slug}`, {
          headers: { "x-menu-key": key },
          cache: "no-store",
        });
        const body = await response.json().catch(() => ({}));
        if (!active) return;

        if (!response.ok) {
          setPhase("error");
          setProblem(
            body?.error ??
              "This menu couldn't be opened. The link may belong to a different menu.",
          );
          return;
        }

        const loaded = toDraft(body.menu as MenuDoc);
        setDraft(loaded);
        setSaved(loaded);
        setSavedAt(body.menu?.updatedAt ?? null);
        setPhase("ready");
      } catch {
        if (!active) return;
        setPhase("error");
        setProblem("Couldn't reach the server. Check your connection and reload.");
      }
    })();

    return () => {
      active = false;
    };
  }, [slug]);

  /* ------------------------------ dirty guard ---------------------------- */

  const dirty = useMemo(
    () => Boolean(draft && saved && JSON.stringify(draft) !== JSON.stringify(saved)),
    [draft, saved],
  );

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  /* ------------------------------- editing ------------------------------- */

  const setField = useCallback(
    <K extends keyof Draft>(field: K, value: Draft[K]) => {
      setDraft((current) => (current ? { ...current, [field]: value } : current));
      setSaveError(null);
    },
    [],
  );

  const setItem = useCallback(
    (index: number, field: keyof MenuItem, value: string) => {
      setDraft((current) => {
        if (!current) return current;
        const items = current.items.map((item, i) =>
          i === index ? { ...item, [field]: value } : item,
        );
        return { ...current, items };
      });
      setSaveError(null);
    },
    [],
  );

  const addItem = useCallback(() => {
    setDraft((current) => {
      if (!current) return current;
      if (current.items.length >= MAX_ITEMS) return current;
      const category = current.items.at(-1)?.category ?? "Menu";
      return { ...current, items: [...current.items, { category, name: "", price: "" }] };
    });
  }, []);

  /* ------------------------- dishes: words and models -------------------- */
  // Three writers, all price-blind by construction: the suggestion path moves
  // name/section/copy, the dish path moves copy, the model path moves a URL.

  const applyDetails = useCallback(
    (
      index: number,
      suggestion: { name: string; category: string; description: string; ingredients: string[] },
    ) => {
      setDraft((current) =>
        current
          ? { ...current, items: applyDishSuggestion(current.items, index, suggestion) }
          : current,
      );
      setSaveError(null);
    },
    [],
  );

  const clearDetails = useCallback((index: number) => {
    setDraft((current) =>
      current ? { ...current, items: setItemDish(current.items, index, null) } : current,
    );
    setSaveError(null);
  }, []);

  const attachModel = useCallback((index: number, model: MenuItem["model"] | null) => {
    setDraft((current) =>
      current ? { ...current, items: setItemModel(current.items, index, model ?? null) } : current,
    );
    setSaveError(null);
  }, []);

  const removeItem = useCallback((index: number) => {
    setDraft((current) => {
      if (!current) return current;
      return { ...current, items: current.items.filter((_, i) => i !== index) };
    });
    setSaveError(null);
  }, []);

  const withModel = useMemo(() => modelCount(draft?.items ?? []), [draft]);

  /* -------------------------------- saving ------------------------------- */

  const save = useCallback(async () => {
    if (!draft || saving) return;
    setSaving(true);
    setSaveError(null);

    try {
      // A renamed row can't keep the translation written for the old name.
      // Prices are untouched by this — the comparison is name and section only.
      const payload = {
        ...draft,
        items: pruneStaleTranslations(draft.items, saved?.items ?? []),
      };

      const response = await fetch(`/api/menus/${slug}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-menu-key": keyRef.current,
        },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        setSaveError(
          body?.error ?? "That didn't save. Nothing was changed — try again.",
        );
        return;
      }

      // The server trims and drops empty rows, so mirror what it decided.
      const normalized = body.menu ? toDraft(body.menu as MenuDoc) : draft;
      setDraft(normalized);
      setSaved(normalized);
      setSavedAt(body.updatedAt ?? new Date().toISOString());
    } catch {
      setSaveError("Couldn't reach the server. Nothing was changed.");
    } finally {
      setSaving(false);
    }
  }, [draft, saved, saving, slug]);

  /* ----------------------------- translating ----------------------------- */

  const untranslated = draft ? missingTranslations(draft.items, "hi") : 0;

  const translateNow = useCallback(async () => {
    if (!draft || translating) return;

    setTranslating(true);
    setTranslateNote(null);

    const outcome = await requestTranslations(translatableLines(draft.items));
    setTranslating(false);

    if (!outcome.ok) {
      setTranslateNote(`${outcome.error.message} Nothing was changed.`);
      return;
    }

    const items = stitchTranslations(draft.items, outcome.translations);
    setDraft((current) => (current ? { ...current, items } : current));
    setTranslateNote("Hindi and Hinglish added. Save to put them on the live menu.");
  }, [draft, translating]);

  /* -------------------------------- copying ------------------------------ */

  const publicUrl = `${origin}${menuPath(slug)}`;
  const editorUrl = `${origin}${menuPath(slug)}/edit#${keyRef.current}`;

  const copy = useCallback(async (value: string, which: "menu" | "editor") => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(which);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      // Clipboard access can be denied; the field is selectable regardless.
    }
  }, []);

  /* --------------------------------- views ------------------------------- */

  if (phase === "loading") {
    return (
      <div className="card flex items-center gap-3 p-6">
        <Loader2 className="h-4 w-4 animate-spin text-espresso-500" aria-hidden />
        <p className="text-[13px] text-espresso-600">Opening your menu…</p>
      </div>
    );
  }

  if (phase === "error" || !draft) {
    return (
      <div className="card p-6">
        <p className="flex items-start gap-2 text-[13px] leading-[1.65] text-espresso-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-caramel-600" aria-hidden />
          <span>{problem ?? "This menu couldn't be opened."}</span>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Live link + QR ------------------------------------------------ */}
      <div className="card p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="label">Your menu is live</p>
            <a
              href={menuPath(slug)}
              className="mt-2 flex items-center gap-1.5 break-all text-[13px] font-semibold text-espresso-900 underline decoration-espresso-900/20 underline-offset-2 hover:decoration-espresso-900/50"
            >
              {publicUrl.replace(/^https?:\/\//, "")}
              <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
            </a>

            <button
              type="button"
              onClick={() => copy(publicUrl, "menu")}
              className="btn-outline tap mt-3 inline-flex min-h-[40px] items-center gap-1.5 px-3 text-[11.5px]"
            >
              {copied === "menu" ? (
                <>
                  <Check className="h-3.5 w-3.5 text-sage-500" /> Copied
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" /> Copy menu link
                </>
              )}
            </button>
          </div>

          <div className="shrink-0 text-center">
            <MenuQr url={publicUrl || menuPath(slug)} size={124} />
            <p className="mt-2 text-[9.5px] uppercase tracking-[0.14em] text-espresso-400">
              Scan to test
            </p>
          </div>
        </div>

        <div className="mt-4 rounded-xl bg-caramel-50/70 px-3 py-2.5">
          <p className="text-[10.5px] leading-[1.6] text-espresso-600">
            <strong className="font-semibold text-espresso-900">
              Bookmark this page.
            </strong>{" "}
            It&apos;s the only way back into the editor — there&apos;s no login and
            no password reset. Anyone you send this link to can edit the menu too.
          </p>
          <button
            type="button"
            onClick={() => copy(editorUrl, "editor")}
            className="btn-outline tap mt-2 inline-flex min-h-[36px] items-center gap-1.5 px-2.5 text-[11px]"
          >
            {copied === "editor" ? (
              <>
                <Check className="h-3 w-3 text-sage-500" /> Copied
              </>
            ) : (
              <>
                <Copy className="h-3 w-3" /> Copy editor link
              </>
            )}
          </button>
        </div>
      </div>

      {/* Café details -------------------------------------------------- */}
      <div className="card space-y-3 p-4 sm:p-5">
        <p className="label">The café</p>

        <label className="block">
          <span className="text-[11px] font-medium text-espresso-600">Name</span>
          <input
            className="input mt-1"
            value={draft.cafeName}
            maxLength={80}
            onChange={(event) => setField("cafeName", event.target.value)}
          />
        </label>

        <label className="block">
          <span className="text-[11px] font-medium text-espresso-600">
            One line under the name — optional
          </span>
          <input
            className="input mt-1"
            value={draft.tagline}
            maxLength={MAX_TAGLINE}
            placeholder="Since 2019 · Hazratganj, Lucknow"
            onChange={(event) => setField("tagline", event.target.value)}
          />
        </label>

        <label className="block">
          <span className="text-[11px] font-medium text-espresso-600">
            WhatsApp number for orders — optional
          </span>
          <input
            className="input mt-1"
            value={draft.whatsapp}
            inputMode="numeric"
            maxLength={15}
            placeholder="919044996869"
            onChange={(event) =>
              setField("whatsapp", event.target.value.replace(/[^\d]/g, ""))
            }
          />
          <span className="mt-1 block text-[10px] text-espresso-400">
            Digits only, with country code. Leave it empty and no order button
            appears.
          </span>
        </label>
      </div>

      {/* Items --------------------------------------------------------- */}
      <div className="card p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <p className="label">Items</p>
          <span className="flex items-center gap-2 text-[10.5px] tabular-nums text-espresso-400">
            {withModel > 0 && (
              <a
                href="#dish-3d"
                className="inline-flex items-center gap-1 rounded-full bg-cream-50 px-2 py-0.5 text-espresso-600 hover:text-espresso-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caramel-500/40"
                title="Jump to the dish details and 3D panel"
              >
                <Rotate3d className="h-2.5 w-2.5 text-caramel-600" aria-hidden />
                {withModel} in 3D
              </a>
            )}
            <span>
              {draft.items.length} / {MAX_ITEMS}
            </span>
          </span>
        </div>

        <p className="mt-2 text-[10.5px] leading-[1.6] text-espresso-500">
          Items with the same section name are grouped together, in the order they
          appear here.
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-cream-50/70 px-2.5 py-2">
          <Languages className="h-3 w-3 shrink-0 text-espresso-400" aria-hidden />
          <p className="min-w-0 flex-1 text-[10.5px] leading-[1.5] text-espresso-600">
            {draft.items.length === 0
              ? "Translate the menu so customers can read it in Hindi or Hinglish."
              : untranslated === 0
                ? "Hindi + Hinglish on every row — customers can switch language."
                : `Hindi + Hinglish on ${draft.items.length - untranslated} of ${draft.items.length} rows. Prices never change.`}
          </p>
          <button
            type="button"
            onClick={() => void translateNow()}
            disabled={translating || draft.items.length === 0}
            className="btn-outline tap inline-flex min-h-[34px] shrink-0 items-center gap-1.5 px-2.5 text-[10.5px] disabled:opacity-50"
          >
            {translating && (
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
            )}
            {translating
              ? "Translating…"
              : untranslated === 0
                ? "Re-translate"
                : "Translate"}
          </button>
        </div>

        {translateNote && (
          <p
            role="status"
            className="mt-2 text-[10.5px] leading-[1.5] text-espresso-600"
          >
            {translateNote}
          </p>
        )}

        <ul className="mt-3 space-y-2">
          {draft.items.map((item, index) => (
            <li
              key={index}
              className="grid grid-cols-[minmax(0,1fr)_88px] gap-1.5 sm:grid-cols-[150px_minmax(0,1fr)_88px_36px] sm:items-center"
            >
              <input
                className="input col-span-2 min-h-[34px] px-2.5 py-1 text-[11px] sm:col-span-1"
                value={item.category}
                maxLength={MAX_CATEGORY}
                aria-label={`Section for item ${index + 1}`}
                placeholder="Section"
                onChange={(event) => setItem(index, "category", event.target.value)}
              />
              <span className="relative">
                <input
                  className={`input min-h-[42px] w-full px-2.5 py-1.5 text-[12.5px] ${
                    hasModel(item) ? "pr-7" : ""
                  }`}
                  value={item.name}
                  maxLength={MAX_ITEM_NAME}
                  aria-label={`Name for item ${index + 1}`}
                  placeholder="Item name"
                  onChange={(event) => setItem(index, "name", event.target.value)}
                />
                {hasModel(item) && (
                  <Rotate3d
                    className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-caramel-600"
                    aria-hidden
                  />
                )}
              </span>
              <input
                className="input min-h-[42px] px-2 py-1.5 text-[12.5px] tabular-nums"
                value={item.price}
                maxLength={MAX_PRICE}
                aria-label={`Price for item ${index + 1}`}
                placeholder="₹80"
                onChange={(event) => setItem(index, "price", event.target.value)}
              />
              <button
                type="button"
                onClick={() => removeItem(index)}
                aria-label={`Remove ${item.name || `item ${index + 1}`}`}
                className="btn-outline tap col-span-2 min-h-[36px] justify-self-end px-2.5 text-espresso-500 hover:text-espresso-900 sm:col-span-1 sm:px-0"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={addItem}
          disabled={draft.items.length >= MAX_ITEMS}
          className="btn-outline tap mt-3 inline-flex min-h-[40px] items-center gap-1.5 px-3 text-[11.5px] disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" /> Add an item
        </button>
      </div>

      {/* Dish details and 3D -------------------------------------------- */}
      <div id="dish-3d" className="scroll-mt-24">
        <DishStudio
          variant="full"
          items={draft.items}
          manualModels={MANUAL_MODELS}
          onApplyDetails={applyDetails}
          onSetModel={attachModel}
          onClearDetails={clearDetails}
        />
      </div>

      {/* Save ---------------------------------------------------------- */}
      <div className="sticky bottom-3 z-10">
        <div className="card flex items-center gap-3 p-3">
          <div className="min-w-0 flex-1">
            {saveError ? (
              <p className="text-[11px] leading-[1.5] text-espresso-800">
                {saveError}
              </p>
            ) : dirty ? (
              <p className="text-[11px] text-espresso-600">Unsaved changes</p>
            ) : (
              <p className="flex items-center gap-1.5 text-[11px] text-espresso-500">
                <Check className="h-3 w-3 text-sage-500" aria-hidden />
                {savedAt
                  ? `Saved ${new Date(savedAt).toLocaleString("en-IN", {
                      day: "numeric",
                      month: "short",
                      hour: "numeric",
                      minute: "2-digit",
                    })}`
                  : "Everything is saved"}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={save}
            disabled={saving || !dirty}
            className="btn-dark tap inline-flex min-h-[42px] shrink-0 items-center gap-1.5 px-4 text-[12.5px] disabled:opacity-45"
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : null}
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>

      <p className="px-1 text-[10px] leading-[1.6] text-espresso-400">
        Prices are what you type — nothing here is calculated or rounded. The page
        updates the moment you save.
      </p>
    </div>
  );
}
