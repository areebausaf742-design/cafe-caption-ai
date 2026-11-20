/**
 * Copy, once.
 *
 * Four components each had their own copy-then-fallback dance, and three of them
 * silently did nothing when the browser refused `navigator.clipboard` — which it
 * does on http:// origins, in some in-app browsers, and after a permission
 * prompt is dismissed. A visible "copied" tick on a copy that never happened is
 * worse than no tick at all, so every caller now gets a boolean.
 */

/**
 * Copy `text` to the clipboard.
 *
 * Returns `true` only when the text really is on the clipboard. The async API is
 * tried first; if it is missing, insecure, or refused, a hidden textarea and
 * `execCommand("copy")` are the fallback (deprecated, but still the only thing
 * that works in older in-app browsers).
 */
export async function copyText(text: string): Promise<boolean> {
  if (!text) return false;

  try {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through: Safari refuses without a user gesture, http origins refuse
    // outright, and some browsers only reject on the first call.
  }

  try {
    const scratch = document.createElement("textarea");
    scratch.value = text;
    scratch.setAttribute("readonly", "");
    scratch.setAttribute("aria-hidden", "true");
    scratch.style.position = "fixed";
    scratch.style.top = "0";
    scratch.style.left = "0";
    scratch.style.opacity = "0";
    scratch.style.pointerEvents = "none";
    document.body.appendChild(scratch);
    scratch.focus();
    scratch.select();
    scratch.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(scratch);
    return ok;
  } catch {
    return false;
  }
}
