import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Builds paralelos (NEXT_DIST_DIR) y artefactos de pruebas.
    ".next-*/**",
    "test-results/**",
    "playwright-report/**",
    ".playwright-mcp/**",
    // Tipos generados por la CLI de Supabase.
    "src/types/database.ts",
  ]),
]);

export default eslintConfig;
