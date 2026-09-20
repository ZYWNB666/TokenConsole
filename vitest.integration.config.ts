import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Integration-test configuration: the production-server page-protection
 * suite. `pnpm test:integration` deletes .next, runs a fresh production
 * build and then executes this config, so the assertions always run against
 * the current source — never a stale or leftover build artifact.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./src/test/server-only-stub.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: [fileURLToPath(new URL("./src/test/console-protection.test.ts", import.meta.url))],
  },
});
