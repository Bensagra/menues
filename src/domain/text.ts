// Normalización de textos para comparar (nunca para mostrar ni para guardar).
// Debe coincidir con app.name_key() en la base: minúsculas, sin tildes, sin
// signos y con espacios simples.

export function nameKey(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const STOPWORDS = new Set(["de", "del", "la", "el", "los", "las", "con", "y", "a", "al", "en", "x"]);

/** Clave más laxa: sin palabras vacías y en singular aproximado. Solo para sugerir coincidencias. */
export function looseKey(value: string | null | undefined): string {
  return nameKey(value)
    .split(" ")
    .filter((word) => word && !STOPWORDS.has(word))
    .map(singularize)
    .join(" ");
}

function singularize(word: string): string {
  if (word.length > 4 && word.endsWith("es") && !word.endsWith("ses")) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith("s")) return word.slice(0, -1);
  return word;
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
    }
    previous = current;
  }
  return previous[b.length];
}

/** Similitud entre 0 y 1 combinando distancia de edición y palabras en común. */
export function similarity(a: string, b: string): number {
  const ka = looseKey(a);
  const kb = looseKey(b);
  if (!ka || !kb) return 0;
  if (ka === kb) return 1;
  const editRatio = 1 - levenshtein(ka, kb) / Math.max(ka.length, kb.length);
  const wa = new Set(ka.split(" "));
  const wb = new Set(kb.split(" "));
  const common = [...wa].filter((w) => wb.has(w)).length;
  const dice = (2 * common) / (wa.size + wb.size);
  const containment = common / Math.min(wa.size, wb.size);
  return Math.max(editRatio, dice, containment === 1 ? 0.8 : 0);
}

/** Limpia texto no confiable (por ejemplo, de una extracción): sin controles, espacios simples, largo acotado. */
export function cleanText(value: string | null | undefined, maxLength: number): string | null {
  if (value === null || value === undefined) return null;
  const cleaned = value
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return null;
  return cleaned.slice(0, maxLength);
}

export function slugify(value: string): string {
  return nameKey(value).replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

export function isValidSlug(value: string): boolean {
  return value.length >= 3 && value.length <= 60 && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(value);
}

/** "1 producto", "3 productos". */
export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}
