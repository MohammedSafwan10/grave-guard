import { defineConfig } from "vitest/config";

export default defineConfig({
  server: { port: 5173, strictPort: true, open: false },
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 900,
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
