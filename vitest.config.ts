import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  test: {
    // Node's File and Blob clone into fake IndexedDB; component tests opt into jsdom.
    environment: "node",
    setupFiles: ["./src/testing/setup.ts"],
    passWithNoTests: true,
    coverage: {
      include: [
        "src/services/storage/**",
        "src/services/sync/**",
        "src/services/github/**",
        "src/services/hash.ts",
      ],
      exclude: ["**/*.test.ts", "src/services/github/authStore.ts"],
      thresholds: { lines: 80, functions: 80, branches: 70 },
    },
  },
});
