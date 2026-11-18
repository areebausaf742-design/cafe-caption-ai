"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Languages } from "lucide-react";

import MenuCard from "@/components/menu/MenuCard";
import MenuOrder from "@/components/menu/MenuOrder";
import { hasModel, recommendations } from "@/lib/dish";
import { track } from "@/lib/analytics";
import { toDigitalMenu } from "@/lib/menu";
import {
  MENU_LANGUAGES,
  availableLanguages,
  coverage,
  languageMeta,
  localizeItems,
  type MenuLanguage,
} from "@/lib/menu-translate";
import type { MenuItem } from "@/lib/types";

// The viewer is fetched the first time somebody actually turns a dish. Menus
// that have no models — or that nobody inspects — never pay for it.
const DishViewer = dynamic(() => import("@/components/menu/DishViewer"), {
  ssr: false,
});

/**
 * The menu a customer actually reads: same card, same cart, three languages.
 *
 * The chosen language never touches the order. Item names go to the café in the
 * language the menu was printed in — their own words, exactly as they typed
 * them — while the customer browses in whichever they can read. A kitchen
 * shouldn't have to map "मसाला चाय" back to a menu it wrote in English.
 *
 * Switching is instant because the translations were written once, when the
 * menu was published: no request, no spinner, no cost per table.
 */
export default function MenuLanguages({
  slug,
  cafeName,
  items,
  whatsapp,
  updated,
}: {
  slug: string;
  cafeName: string;
  items: MenuItem[];
  /** Digits only, with country code, or "" for a read-only menu. */
  whatsapp: string;
  updated?: string | null;
}) {
  const languages = useMemo(() => availableLanguages(items), [items]);
  const [language, setLanguage] = useState<MenuLanguage>("en");
  // Which dish is open in 3D, by index into `items`. Lives here — next to the
  // cart — so turning a dish can never reset an order in progress.
  const [inspecting, setInspecting] = useState<number | null>(null);

  // If an edited menu loses a language, fall back rather than render blanks.
  const active = languages.includes(language) ? language : "en";
  const meta = languageMeta(active);

  const localizedItems = useMemo(() => localizeItems(items, active), [items, active]);
  const localized = useMemo(() => toDigitalMenu(localizedItems), [localizedItems]);

  const inspectingItem = inspecting === null ? null : items[inspecting];
  const openInspect = useCallback((index: number) => {
    setInspecting(index);
    track({ name: "dish_3d_open" });
  }, []);

  // Screen readers pick their voice from here, so a Devanagari menu isn't read
  // out in an English accent.
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.lang;
    root.lang = meta.tag;
    return () => {
      root.lang = previous;
    };
  }, [meta.tag]);

  const choose = useCallback((next: MenuLanguage) => {
    setLanguage(next);
    track({ name: "menu_language", props: { language: next } });
  }, []);

  // Which offered languages are missing rows, and how many. Said out loud
  // before the customer taps, because "half this menu is still in English" is
  // something to know while choosing a language, not after.
  const partial = useMemo(
    () =>
      MENU_LANGUAGES.filter(
        (option) =>
          option.id !== "en" &&
          languages.includes(option.id) &&
          coverage(items, option.id) < items.length,
      ).map((option) => ({ option, done: coverage(items, option.id) })),
    [items, languages],
  );

  return (
    <>
      {languages.length > 1 && (
        <div className="mb-3">
          <div
            role="group"
            aria-label="Read this menu in"
            className="flex items-center justify-center gap-1.5"
          >
            <Languages className="h-3 w-3 shrink-0 text-espresso-300" aria-hidden />
            {MENU_LANGUAGES.filter((option) => languages.includes(option.id)).map(
              (option) => {
                const selected = option.id === active;
                return (
                  <button
                    key={option.id}
                    type="button"
                    lang={option.tag}
                    onClick={() => choose(option.id)}
                    aria-pressed={selected}
                    aria-label={`Read the menu in ${option.label}`}
                    className={`tap inline-flex min-h-[36px] items-center rounded-full px-3 text-[11.5px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caramel-500/45 ${
                      selected
                        ? "bg-espresso-900 text-cream-50"
                        : "border border-espresso-900/[0.14] bg-white/60 text-espresso-700 hover:border-espresso-900/30 hover:bg-white hover:text-espresso-900"
                    }`}
                  >
                    {option.native}
                  </button>
                );
              },
            )}
          </div>

          {partial.length > 0 && (
            <p className="mt-2 text-center text-[10px] leading-[1.5] text-espresso-400">
              {partial
                .map(({ option, done }) => `${option.native} covers ${done} of ${items.length} items`)
                .join(" · ")}{" "}
              — the rest stay in the printed language.
            </p>
          )}
        </div>
      )}

      {whatsapp ? (
        <MenuOrder
          slug={slug}
          cafeName={cafeName}
          menu={localized}
          items={items}
          whatsapp={whatsapp}
          updated={updated}
          language={active}
          onInspect={openInspect}
        />
      ) : (
        <MenuCard
          menu={localized}
          cafeName={cafeName}
          isSample={false}
          updated={updated}
          onInspect={openInspect}
        />
      )}

      {inspecting !== null && inspectingItem && hasModel(inspectingItem) && (
        <DishViewer
          // Re-mounting on a different dish resets the whole three.js scene
          // rather than trying to swap geometry inside a live renderer.
          key={`${inspectingItem.name}-${inspectingItem.model?.glb}`}
          name={localizedItems[inspecting]?.name ?? inspectingItem.name}
          dish={inspectingItem.dish}
          model={inspectingItem.model!}
          recommendations={recommendations(localizedItems, inspecting)}
          onClose={() => setInspecting(null)}
        />
      )}
    </>
  );
}
