import { z } from "zod";

/** Sitio web del local: acepta "milocal.com.ar" o "https://milocal.com.ar"; vacío lo borra. */
export const websiteSchema = z
  .string()
  .trim()
  .max(300, "La dirección es demasiado larga.")
  .transform((value) => (value && !/^https?:\/\//i.test(value) ? `https://${value}` : value))
  .refine((value) => {
    if (!value) return true;
    try {
      const url = new URL(value);
      return (url.protocol === "https:" || url.protocol === "http:") && url.hostname.includes(".") && !/\s/.test(value);
    } catch {
      return false;
    }
  }, "Escribí la dirección completa de tu sitio, por ejemplo https://milocal.com.ar.");

/** Redes sociales: se guardan, pero no se pueden leer sin iniciar sesión. */
export function isSocialProfile(value: string): boolean {
  return /(^|\.)(instagram\.com|facebook\.com|fb\.com|tiktok\.com|x\.com|twitter\.com|threads\.net)(\/|$)/i.test(value.replace(/^https?:\/\//i, ""));
}
