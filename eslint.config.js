import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "node_modules", "assets-src", "public", "playwright-report", "test-results"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
  {
    // The simulation must stay deterministic.
    files: ["src/sim/**", "src/quiz/**"],
    rules: {
      "no-restricted-properties": [
        "error",
        { object: "Math", property: "random", message: "Use the seeded RNG from src/sim/rng.ts." },
        { object: "Date", property: "now", message: "The sim counts ticks, not wall time." },
      ],
      "no-restricted-globals": ["error", "window", "document", "performance"],
    },
  },
);
