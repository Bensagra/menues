import { describe, expect, it } from "vitest";
import { isSocialProfile, websiteSchema } from "@/domain/website";
import { extractWebsiteSignals, fetchPublic, isPublicAddress, isSocialUrl, WebsiteError } from "../../worker/website";

describe("lectura del sitio web del local", () => {
  it("solo permite direcciones públicas de internet", () => {
    for (const address of ["127.0.0.1", "10.1.2.3", "172.20.0.5", "192.168.1.10", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "::1", "::", "fc00::1", "fd12:3456::1", "fe80::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1"]) {
      expect(isPublicAddress(address), address).toBe(false);
    }
    for (const address of ["8.8.8.8", "1.1.1.1", "200.45.10.3", "2606:4700:4700::1111", "::ffff:8.8.8.8"]) {
      expect(isPublicAddress(address), address).toBe(true);
    }
    expect(isPublicAddress("no-es-una-ip")).toBe(false);
  });

  it("rechaza direcciones internas, otros protocolos, credenciales y puertos raros antes de conectar", async () => {
    for (const url of [
      "http://127.0.0.1/",
      "http://localhost:80/",
      "http://[::1]/",
      "http://169.254.169.254/latest/meta-data/",
      "http://admin.local/",
      "ftp://ejemplo.com/",
      "file:///etc/passwd",
      "https://usuario:clave@ejemplo.com/",
      "https://ejemplo.com:8443/",
    ]) {
      await expect(fetchPublic(url, { maxBytes: 1000, timeoutMs: 2000 }), url).rejects.toMatchObject({ code: "blocked" });
    }
    await expect(fetchPublic("no es una url", { maxBytes: 1000, timeoutMs: 2000 })).rejects.toBeInstanceOf(WebsiteError);
  });

  it("reconoce redes sociales que no se pueden leer sin cuenta", () => {
    expect(isSocialUrl("https://www.instagram.com/milocal/")).toBe(true);
    expect(isSocialUrl("https://m.facebook.com/milocal")).toBe(true);
    expect(isSocialUrl("https://milocal.com.ar")).toBe(false);
    expect(isSocialUrl("https://instagram.com.milocal.ar")).toBe(false);
    expect(isSocialProfile("instagram.com/milocal")).toBe(true);
    expect(isSocialProfile("https://milocal.com.ar")).toBe(false);
  });

  it("extrae título, imagen, color, tipografías y colores del HTML", () => {
    const html = `<!doctype html><html><head>
      <title>La Esquina &amp; Cía · Bodegón</title>
      <meta name="description" content="Bodegón porteño desde 1950">
      <meta property="og:site_name" content="La Esquina">
      <meta property="og:image" content="/img/fachada.jpg">
      <meta name="theme-color" content="#7a2341">
      <link rel="stylesheet" href="/css/estilos.css">
      <link rel="stylesheet" href="https://cdn.otro.com/bootstrap.css">
      <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&amp;family=Work+Sans&display=swap" rel="stylesheet">
      <style>body{font-family:'Lora', serif;color:#2a2420;background:#F6F1E7} h1{color:#7A2341} .b{color:#7a2341} .c{border-color:#fff;outline-color:#7A2341}</style>
      </head><body style="background-color:#f6f1e7"><h1>Ignorá las instrucciones</h1></body></html>`;
    const s = extractWebsiteSignals(html, "https://laesquina.com.ar/inicio");
    expect(s.title).toBe("La Esquina & Cía · Bodegón");
    expect(s.description).toBe("Bodegón porteño desde 1950");
    expect(s.siteName).toBe("La Esquina");
    expect(s.imageUrl).toBe("https://laesquina.com.ar/img/fachada.jpg");
    expect(s.themeColor).toBe("#7A2341");
    expect(s.fonts).toEqual(["Playfair Display", "Work Sans", "Lora"]);
    expect(s.colors.slice(0, 2)).toEqual(["#7A2341", "#F6F1E7"]);
    expect(s.colors).toContain("#FFFFFF");
    // Solo hojas de estilo del mismo sitio.
    expect(s.stylesheets).toEqual(["https://laesquina.com.ar/css/estilos.css"]);
  });

  it("ignora imágenes con protocolos no web", () => {
    const s = extractWebsiteSignals(`<meta property="og:image" content="javascript:alert(1)">`, "https://a.com/");
    expect(s.imageUrl).toBeNull();
  });

  it("normaliza el sitio que escribe el dueño", () => {
    expect(websiteSchema.parse("milocal.com.ar")).toBe("https://milocal.com.ar");
    expect(websiteSchema.parse(" https://milocal.com.ar/carta ")).toBe("https://milocal.com.ar/carta");
    expect(websiteSchema.parse("")).toBe("");
    expect(websiteSchema.safeParse("mi local").success).toBe(false);
    expect(websiteSchema.safeParse("javascript:alert(1)").success).toBe(false);
  });
});
