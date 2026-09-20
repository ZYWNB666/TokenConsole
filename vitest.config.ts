import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Unit-test configuration: everything except the production-server
 * integration suite, which has its own config and is driven by
 * `pnpm test:integration` (it builds fresh and then runs).
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // The real module throws outside the React server runtime; the modules
      // under test import it purely as an import-safety marker.
      "server-only": fileURLToPath(new URL("./src/test/server-only-stub.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    exclude: [
      "**/node_modules/**",
      fileURLToPath(new URL("./src/test/console-protection.test.ts", import.meta.url)),
    ],
  },
});
