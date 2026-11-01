import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";

// Lectura del sitio web de un local para inspirar su diseño (colores,
// tipografías, imagen de portada). La URL la escribe el dueño, así que se trata
// como no confiable: solo http(s) a direcciones públicas (también después de
// cada redirección y al resolver el DNS, contra DNS rebinding), con límite de
// tamaño y de tiempo. Lo que se extrae se le pasa a la IA como datos.

export class WebsiteError extends Error {
  constructor(
    readonly code: "blocked" | "unreachable" | "too_large" | "not_html" | "not_image" | "social",
    message: string,
  ) {
    super(message);
    this.name = "WebsiteError";
  }
}

/** Redes sociales que no se pueden leer sin iniciar sesión. */
const SOCIAL_HOSTS = ["instagram.com", "facebook.com", "fb.com", "tiktok.com", "x.com", "twitter.com", "threads.net"];

export function isSocialUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return SOCIAL_HOSTS.some((social) => host === social || host.endsWith(`.${social}`));
  } catch {
    return false;
  }
}

function ipv4ToNumber(address: string): number {
  return address.split(".").reduce((acc, part) => acc * 256 + Number(part), 0);
}

const BLOCKED_V4: [string, number][] = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

/** true solo para direcciones de internet (nunca locales, privadas ni reservadas). */
export function isPublicAddress(address: string): boolean {
  const family = net.isIP(address);
  if (family === 4) {
    const value = ipv4ToNumber(address);
    return !BLOCKED_V4.some(([base, bits]) => {
      const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
      return ((value & mask) >>> 0) === ((ipv4ToNumber(base) & mask) >>> 0);
    });
  }
  if (family === 6) {
    const lower = address.toLowerCase();
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
    if (mapped) return isPublicAddress(mapped[1]);
    if (lower === "::" || lower === "::1") return false;
    const first = parseInt(lower.split(":")[0] || "0", 16);
    if ((first & 0xfe00) === 0xfc00) return false; // fc00::/7 (privadas)
    if ((first & 0xffc0) === 0xfe80) return false; // fe80::/10 (enlace local)
    if ((first & 0xff00) === 0xff00) return false; // multicast
    if (lower.startsWith("64:ff9b:") || lower.startsWith("2001:db8:")) return false;
    return true;
  }
  return false;
}

type LookupCallback = (error: NodeJS.ErrnoException | null, address: string | dns.LookupAddress[], family?: number) => void;

/** Resuelve el DNS y descarta direcciones no públicas en el momento de conectar. */
function safeLookup(hostname: string, options: dns.LookupOptions, callback: LookupCallback) {
  dns.lookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) return callback(error, "");
    const allowed = (addresses as dns.LookupAddress[]).filter((a) => isPublicAddress(a.address));
    if (!allowed.length) return callback(Object.assign(new Error("Dirección no permitida"), { code: "EBLOCKED" }), "");
    if (options.all) return callback(null, allowed);
    callback(null, allowed[0].address, allowed[0].family);
  });
}

export interface FetchedResource {
  url: string;
  contentType: string;
  body: Buffer;
}

function checkUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new WebsiteError("blocked", "La dirección no es válida");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new WebsiteError("blocked", "Solo se leen páginas http o https");
  if (url.username || url.password) throw new WebsiteError("blocked", "La dirección no puede incluir usuario ni contraseña");
  if (url.port && !["80", "443"].includes(url.port)) throw new WebsiteError("blocked", "Puerto no permitido");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(host) && !isPublicAddress(host)) throw new WebsiteError("blocked", "Dirección no permitida");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new WebsiteError("blocked", "Dirección no permitida");
  }
  return url;
}

function requestOnce(url: URL, maxBytes: number, signal: AbortSignal): Promise<{ status: number; location?: string; contentType: string; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const client = url.protocol === "https:" ? https : http;
    const req = client.request(
      url,
      {
        method: "GET",
        lookup: safeLookup as never,
        headers: {
          "User-Agent": "CartaLista/1.0 (+diseño de cartas digitales)",
          Accept: "text/html,application/xhtml+xml,text/css,image/*;q=0.9,*/*;q=0.5",
          "Accept-Language": "es-AR,es;q=0.9",
        },
        signal,
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const contentType = String(res.headers["content-type"] ?? "").toLowerCase();
        if (status >= 300 && status < 400) {
          res.resume();
          return resolve({ status, location: res.headers.location, contentType, body: Buffer.alloc(0) });
        }
        const declared = Number(res.headers["content-length"] ?? 0);
        if (declared > maxBytes) {
          res.destroy();
          return reject(new WebsiteError("too_large", "El archivo es demasiado grande"));
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > maxBytes) {
            res.destroy();
            reject(new WebsiteError("too_large", "El archivo es demasiado grande"));
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () => resolve({ status, contentType, body: Buffer.concat(chunks) }));
        res.on("error", reject);
      },
    );
    req.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "EBLOCKED") reject(new WebsiteError("blocked", "Dirección no permitida"));
      else reject(new WebsiteError("unreachable", `No se pudo leer la página (${error.code ?? error.name})`));
    });
    req.end();
  });
}

/** GET con redirecciones verificadas una por una (máximo 3). */
export async function fetchPublic(raw: string, options: { maxBytes: number; timeoutMs: number; signal?: AbortSignal }): Promise<FetchedResource> {
  const signal = AbortSignal.any([AbortSignal.timeout(options.timeoutMs), ...(options.signal ? [options.signal] : [])]);
  let url = checkUrl(raw);
  for (let hop = 0; hop <= 3; hop++) {
    const result = await requestOnce(url, options.maxBytes, signal);
    if (result.location) {
      url = checkUrl(new URL(result.location, url).toString());
      continue;
    }
    if (result.status < 200 || result.status >= 300) throw new WebsiteError("unreachable", `La página respondió ${result.status}`);
    return { url: url.toString(), contentType: result.contentType, body: result.body };
  }
  throw new WebsiteError("unreachable", "Demasiadas redirecciones");
}

// ---------------------------------------------------------------------------
// Señales de identidad en el HTML (funciones puras, probadas)
// ---------------------------------------------------------------------------
export interface WebsiteSignals {
  url: string;
  title: string | null;
  description: string | null;
  siteName: string | null;
  themeColor: string | null;
  imageUrl: string | null;
  fonts: string[];
  colors: string[];
  stylesheets: string[];
}

const decode = (value: string) =>
  value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)));

const clip = (value: string | null | undefined, max: number) => {
  const text = value ? decode(value).replace(/\s+/g, " ").trim() : "";
  return text ? text.slice(0, max) : null;
};

function attributes(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const match of tag.matchAll(/([a-zA-Z_:-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
    attrs[match[1].toLowerCase()] = match[3] ?? match[4] ?? match[5] ?? "";
  }
  return attrs;
}

const GENERIC_FONTS = new Set([
  "serif",
  "sans-serif",
  "monospace",
  "cursive",
  "fantasy",
  "system-ui",
  "-apple-system",
  "blinkmacsystemfont",
  "inherit",
  "initial",
  "unset",
  "ui-sans-serif",
  "ui-serif",
  "segoe ui",
  "roboto",
  "helvetica",
  "helvetica neue",
  "arial",
  "var(",
]);

/** Familias tipográficas: las de Google Fonts y las declaradas en el CSS. */
export function extractFonts(html: string, css: string[]): string[] {
  const fonts: string[] = [];
  for (const match of html.matchAll(/fonts\.googleapis\.com\/css2?\?([^"'\s>]+)/gi)) {
    for (const family of decode(match[1]).matchAll(/family=([^&:]+)/g)) fonts.push(decodeURIComponent(family[1].replace(/\+/g, " ")));
  }
  for (const source of [html, ...css]) {
    for (const match of source.matchAll(/font-family\s*:\s*([^;}{]+)/gi)) {
      const first = match[1].split(",")[0].trim().replace(/^["']|["']$/g, "").replace(/\s*!important$/, "");
      if (first && !GENERIC_FONTS.has(first.toLowerCase()) && !first.startsWith("var(")) fonts.push(first);
    }
  }
  const seen = new Set<string>();
  return fonts.filter((font) => {
    const key = font.toLowerCase();
    if (seen.has(key) || font.length > 40) return false;
    seen.add(key);
    return true;
  }).slice(0, 8);
}

/** Colores #RGB/#RRGGBB más usados en estilos (los más frecuentes primero). */
export function extractColors(sources: string[]): string[] {
  const counts = new Map<string, number>();
  for (const source of sources) {
    for (const match of source.matchAll(/#([0-9a-f]{6}|[0-9a-f]{3})\b/gi)) {
      const raw = match[1];
      const full = (raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw).toUpperCase();
      counts.set(`#${full}`, (counts.get(`#${full}`) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([color]) => color);
}

export function extractWebsiteSignals(html: string, pageUrl: string, css: string[] = []): WebsiteSignals {
  const head = html.slice(0, 400_000);
  const metas = [...head.matchAll(/<meta\b[^>]*>/gi)].map((m) => attributes(m[0]));
  const meta = (key: string) => metas.find((m) => (m.property ?? m.name ?? "").toLowerCase() === key)?.content ?? null;
  const links = [...head.matchAll(/<link\b[^>]*>/gi)].map((m) => attributes(m[0]));
  const resolve = (href: string | null | undefined) => {
    if (!href) return null;
    try {
      const url = new URL(decode(href), pageUrl);
      return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
    } catch {
      return null;
    }
  };
  const icon = links.find((l) => /apple-touch-icon/i.test(l.rel ?? ""))?.href;
  const host = new URL(pageUrl).hostname;
  const stylesheets = links
    .filter((l) => /(^|\s)stylesheet(\s|$)/i.test(l.rel ?? ""))
    .map((l) => resolve(l.href))
    .filter((href): href is string => Boolean(href) && new URL(href!).hostname === host);
  const styleBlocks = [...head.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]);
  const styleAttrs = [...head.matchAll(/\sstyle\s*=\s*"([^"]*)"/gi)].map((m) => m[1]);
  const themeColor = meta("theme-color");
  return {
    url: pageUrl,
    title: clip(head.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1], 160),
    description: clip(meta("og:description") ?? meta("description"), 300),
    siteName: clip(meta("og:site_name"), 120),
    themeColor: themeColor && /^#[0-9a-f]{6}$/i.test(themeColor.trim()) ? themeColor.trim().toUpperCase() : null,
    imageUrl: resolve(meta("og:image") ?? meta("twitter:image") ?? icon),
    fonts: extractFonts(head, css),
    colors: extractColors([...styleBlocks, ...styleAttrs, ...css]),
    stylesheets: [...new Set(stylesheets)].slice(0, 2),
  };
}

/** Lee el sitio: la página, hasta 2 hojas de estilo propias y la imagen principal. */
export async function readWebsite(url: string, signal?: AbortSignal): Promise<{ signals: WebsiteSignals; image: Buffer | null }> {
  if (isSocialUrl(url)) throw new WebsiteError("social", "Las redes sociales no se pueden leer sin iniciar sesión");
  const page = await fetchPublic(url, { maxBytes: 2_000_000, timeoutMs: 10_000, signal });
  if (!page.contentType.includes("html")) throw new WebsiteError("not_html", "La dirección no es una página web");
  const html = page.body.toString("utf8");
  const first = extractWebsiteSignals(html, page.url);
  const css: string[] = [];
  for (const sheet of first.stylesheets) {
    try {
      const resource = await fetchPublic(sheet, { maxBytes: 600_000, timeoutMs: 8_000, signal });
      if (resource.contentType.includes("css")) css.push(resource.body.toString("utf8"));
    } catch {
      // Una hoja de estilo que no se puede leer no impide usar el resto.
    }
  }
  const signals = css.length ? extractWebsiteSignals(html, page.url, css) : first;
  let image: Buffer | null = null;
  if (signals.imageUrl) {
    try {
      const resource = await fetchPublic(signals.imageUrl, { maxBytes: 6_000_000, timeoutMs: 10_000, signal });
      if (resource.contentType.startsWith("image/")) image = resource.body;
    } catch {
      // Sin imagen se sigue con los colores y tipografías.
    }
  }
  return { signals, image };
}
