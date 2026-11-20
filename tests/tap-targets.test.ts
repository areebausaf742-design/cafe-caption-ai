import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Structural guard for the bug MobileTest found: "Upload a photo of your café or
 * food" measured as a 1×1 tap target.
 *
 * The cause was the classic pattern — a `sr-only` `<input type="file">` next to a
 * styled button — where the element the audit measures is the 1px input, not the
 * button. The fix makes the input itself the target: transparent, absolutely
 * positioned over its `<label>`, so its box is the full control.
 *
 * These assertions are on the source because there is no browser in this
 * environment; they encode the invariant that keeps the regression away.
 */

const ROOT = process.cwd();

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = path.join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

const files = [...walk(path.join(ROOT, "app")), ...walk(path.join(ROOT, "components"))];

/** Every `<input …>` element in a file, as its raw source text. */
function fileInputs(source: string): string[] {
  const blocks = source.match(/<input\b[\s\S]*?\/>/g) ?? [];
  return blocks.filter((block) => /type="file"/.test(block));
}

const allInputs = files.flatMap((file) =>
  fileInputs(readFileSync(file, "utf8")).map((block) => ({ file, block })),
);

describe("file inputs are their own tap target", () => {
  it("finds the upload controls at all (guards against a silent no-op)", () => {
    expect(allInputs.length).toBeGreaterThanOrEqual(2);
  });

  it("no file input is `sr-only`", () => {
    const hidden = allInputs.filter(({ block }) => /sr-only/.test(block));
    expect(
      hidden.map((h) => path.relative(ROOT, h.file)),
      "a `sr-only` file input is a 1×1 tap target — overlay it on a label instead",
    ).toEqual([]);
  });

  it("every file input covers its control (absolute inset-0, full size)", () => {
    for (const { file, block } of allInputs) {
      const className = /className="([^"]*)"/.exec(block)?.[1] ?? "";
      const sized =
        /absolute/.test(className) &&
        /inset-0/.test(className) &&
        /h-full/.test(className) &&
        /w-full/.test(className);
      expect(sized, `${path.relative(ROOT, file)}: ${className}`).toBe(true);
    }
  });

  it("every file input has an accessible name", () => {
    for (const { file, block } of allInputs) {
      expect(/aria-label=/.test(block), path.relative(ROOT, file)).toBe(true);
    }
  });

  it("the dropzone keeps its 116px trigger box", () => {
    const dropzone = readFileSync(
      path.join(ROOT, "components/PhotoDropzone.tsx"),
      "utf8",
    );
    expect(dropzone).toContain("min-h-[116px]");
  });
});
