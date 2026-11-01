import { defineConfig, devices } from "@playwright/test";

// Pruebas de punta a punta contra un build de producción en un puerto propio
// (no pisa el servidor de desarrollo) y Supabase local. El worker corre con el
// proveedor simulado, que solo se permite fuera de producción y siempre se
// muestra como "Resultado simulado".

const PORT = Number(process.env.E2E_PORT ?? 3211);
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    locale: "es-AR",
    timezoneId: "America/Argentina/Buenos_Aires",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, grepInvert: /@mobile/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, grep: /@mobile/ },
  ],
  webServer: [
    {
      name: "app",
      command: `npx next build && npx next start -p ${PORT}`,
      url: `${BASE_URL}/ingresar`,
      env: { NEXT_DIST_DIR: ".next-e2e", NEXT_PUBLIC_APP_URL: BASE_URL },
      timeout: 600_000,
      reuseExistingServer: false,
      stdout: "ignore",
    },
    {
      name: "worker",
      command: "npx tsx --env-file-if-exists=.env.local worker/index.ts",
      env: { AI_PROVIDER: "mock", ALLOW_MOCK_AI: "true", NODE_ENV: "development", WORKER_POLL_INTERVAL_MS: "1000" },
      wait: { stdout: /worker iniciado/ },
      timeout: 60_000,
      gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
      stdout: "ignore",
    },
  ],
});
