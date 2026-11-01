import sharp from "sharp";

/** Genera una "foto" de carta (JPEG) con texto, para pruebas. */
export async function menuImage(lines: string[], options: { width?: number; seed?: string } = {}): Promise<Buffer> {
  const width = options.width ?? 1000;
  const height = Math.max(800, 120 + lines.length * 56);
  const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const text = lines
    .map((line, i) => `<text x="60" y="${110 + i * 56}" font-family="Helvetica, Arial, sans-serif" font-size="${line.startsWith("#") ? 40 : 30}" font-weight="${line.startsWith("#") ? 700 : 400}" fill="#2b2b2b">${escape(line.replace(/^#\s*/, ""))}</text>`)
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#fbf7ec"/>${text}<text x="${width - 200}" y="${height - 30}" font-size="14" fill="#fbf7ec">${escape(options.seed ?? "")}</text></svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 85 }).toBuffer();
}
