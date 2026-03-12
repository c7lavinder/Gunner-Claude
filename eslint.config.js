import tseslint from "typescript-eslint";
import prettierConfig from "eslint-config-prettier";

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "drizzle/migrations/**",
      "*.config.*",
    ],
  },
  ...tseslint.configs.recommended,
  prettierConfig,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "no-console": ["warn", { allow: ["log", "info", "warn", "error"] }],
      "no-restricted-syntax": [
        "warn",
        {
          selector: "Literal[value='property']",
          message: "Use terminology from useTenantConfig() instead of hardcoded 'property'.",
        },
        {
          selector: "Literal[value='properties']",
          message: "Use terminology from useTenantConfig() instead of hardcoded 'properties'.",
        },
        {
          selector: "Literal[value='lead']",
          message: "Use stage codes from useTenantConfig() instead of hardcoded 'lead'.",
        },
      ],
    },
  }
);
