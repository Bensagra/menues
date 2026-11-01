// Registro estructurado (una línea JSON por evento) que nunca incluye secretos
// ni el contenido de las imágenes.

const SECRET_PATTERNS = [/Bearer\s+[A-Za-z0-9._~+/=-]+/g, /sb_secret_[A-Za-z0-9_-]+/g, /xai-[A-Za-z0-9_-]{10,}/g, /AIza[A-Za-z0-9_-]{30,}/g, /AQ\.[A-Za-z0-9_-]{30,}/g, /eyJ[A-Za-z0-9._-]{20,}/g];

export function redact(value: string): string {
  let result = value;
  for (const key of [process.env.XAI_API_KEY, process.env.GEMINI_API_KEY]) {
    if (key && key.length > 8) result = result.split(key).join("[redactado]");
  }
  for (const pattern of SECRET_PATTERNS) result = result.replace(pattern, "[redactado]");
  return result.slice(0, 1000);
}

type Level = "info" | "warn" | "error";

function write(level: Level, message: string, fields: Record<string, unknown> = {}) {
  const safe: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) safe[k] = typeof v === "string" ? redact(v) : v;
  const line = JSON.stringify({ time: new Date().toISOString(), level, message: redact(message), ...safe });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const log = {
  info: (message: string, fields?: Record<string, unknown>) => write("info", message, fields),
  warn: (message: string, fields?: Record<string, unknown>) => write("warn", message, fields),
  error: (message: string, fields?: Record<string, unknown>) => write("error", message, fields),
};
