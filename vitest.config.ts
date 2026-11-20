import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Unit tests for the pure logic — the parts where a bug is silent.
 *
 * `@/` is aliased by hand (Vitest doesn't read `tsconfig.paths`), and
 * `server-only` is stubbed: it exists to make Next's *build* fail when a secret
 * module is imported into a client component, which has no meaning in Node.
 * These tests import the modules directly, so nothing is disguised.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
      "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
