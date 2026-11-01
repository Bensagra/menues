// Evita redirecciones abiertas: solo se aceptan rutas internas.

export function safeInternalPath(value: string | null | undefined, appUrl: string, fallback = "/panel"): string {
  if (!value) return fallback;
  try {
    if (value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\")) {
      const url = new URL(value, appUrl);
      return `${url.pathname}${url.search}`;
    }
    const url = new URL(value);
    const app = new URL(appUrl);
    if (url.origin === app.origin) return `${url.pathname}${url.search}`;
  } catch {
    // valor inválido
  }
  return fallback;
}
