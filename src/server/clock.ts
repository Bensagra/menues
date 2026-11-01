import "server-only";
import { connection } from "next/server";

/**
 * Hora de la solicitud en milisegundos. Espera a `connection()` para que la
 * ruta se renderice por solicitud y nunca muestre estados con una hora vieja.
 */
export async function requestTime(): Promise<number> {
  await connection();
  return Date.now();
}
