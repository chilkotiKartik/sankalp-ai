import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@shared": path.resolve(__dirname, "shared") } },
  test: {
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    environment: "node",
    pool: "forks",
    testTimeout: 20000,
    coverage: { provider: "v8", include: ["server/**/*.ts"], reporter: ["text-summary"] },
  },
});
