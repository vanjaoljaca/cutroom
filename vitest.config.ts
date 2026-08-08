export default defineConfig({
  test: {
    globals: true,
    include: ["src/**/*.test.ts", "server/**/*.test.ts"],
  },
});

import { defineConfig } from "vitest/config";
