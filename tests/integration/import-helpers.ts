import { createHash, randomUUID } from "node:crypto";
import { ProviderError, type MenuExtractionProvider } from "@/ai/types";
import type { PageExtraction } from "@/domain/extraction";
import { DEFAULT_THEME, type MenuTheme } from "@/domain/theme";
import { inspectImage } from "@/lib/images";
import { processImport } from "../../worker/process-import";
import { menuImage } from "../helpers/menu-image";
import { adminClient, type TestBusiness, type TestUser } from "./helpers";

/** Proveedor de pruebas: devuelve la extracción indicada o falla con el código pedido. */
export class TestProvider implements MenuExtractionProvider {
  readonly name = "mock" as const;
  readonly model = "test";
  readonly simulated = true;
  calls = 0;
  constructor(private readonly result: PageExtraction | { fail: ProviderError["code"] }) {}
  async extractPage() {
    this.calls++;
    if ("fail" in this.result) throw new ProviderError(this.result.fail, `falla de prueba: ${this.result.fail}`);
    return { data: this.result, model: "test", usage: { input_tokens: 10, output_tokens: 5, cost_usd_ticks: 0 } };
  }
  designCalls: { images: string[]; context: string }[] = [];
  async designTheme(input: { images: { label: string }[]; context: string }) {
    this.designCalls.push({ images: input.images.map((i) => i.label), context: input.context });
    if ("fail" in this.result) throw new ProviderError(this.result.fail, `falla de prueba: ${this.result.fail}`);
    return { data: { theme: TEST_THEME, summary: "Propuesta de prueba." }, model: "test", usage: { input_tokens: 10, output_tokens: 5, cost_usd_ticks: 0 } };
  }
}

export const TEST_THEME: MenuTheme = {
  ...DEFAULT_THEME,
  colors: { ...DEFAULT_THEME.colors, accent: "#7A2341" },
  fonts: { display: "playfair", body: "dm_sans" },
};

export function page(categories: PageExtraction["categories"]): PageExtraction {
  return { page_readable: true, page_notes: null, currency_text: "$", categories };
}

export function item(name: string, priceText: string | null, priceValue: string | null, extra: Partial<PageExtraction["categories"][number]["items"][number]> = {}) {
  return { name, description: null, price_text: priceText, price_value: priceValue, variants: [], illegible_fields: [], ...extra } as PageExtraction["categories"][number]["items"][number];
}

/** Crea y envía una importación de una foto (como lo hace la app). Devuelve su id. */
export async function submitImport(
  user: TestUser,
  business: TestBusiness,
  options: { scope?: "full" | "categories" | "prices_only"; categoryIds?: string[]; branchIds?: string[]; seed?: string } = {},
) {
  const image = await menuImage(["# CARTA", `foto ${options.seed ?? randomUUID()}`]);
  const { data, error } = await user.client.rpc("create_import", {
    p_menu_id: business.menuId,
    p_branch_ids: options.branchIds ?? [business.branchId],
    p_scope: options.scope ?? "full",
    p_category_ids: options.categoryIds ?? [],
    p_files: [{ name: "carta.jpg", type: "image/jpeg", size: image.byteLength }],
    p_idempotency_key: randomUUID(),
  });
  if (error) throw error;
  const created = data as { import_id: string; images: { id: string; storage_path: string }[] };
  const admin = adminClient();
  const { error: uploadError } = await admin.storage
    .from("import-originals")
    .upload(created.images[0].storage_path, image, { contentType: "image/jpeg", upsert: true });
  if (uploadError) throw uploadError;
  const info = await inspectImage(image, { maxBytes: 20_000_000, minSide: 100, maxSide: 12000 });
  const submit = await admin.rpc("server_submit_import", {
    p_actor_id: user.id,
    p_import_id: created.import_id,
    p_pages: [
      {
        image_id: created.images[0].id,
        page_number: 1,
        rotation: 0,
        sha256: createHash("sha256").update(image).digest("hex"),
        bytes: info.bytes,
        width: info.width,
        height: info.height,
        format: info.format,
      },
    ],
  });
  return { importId: created.import_id, error: submit.error };
}

/** Toma la importación indicada de la cola (como el worker) y la procesa. */
export async function processWith(importId: string, provider: MenuExtractionProvider) {
  const admin = adminClient();
  await admin.from("imports").update({ next_attempt_at: new Date(Date.now() - 1000).toISOString() } as never).eq("id", importId).eq("status", "pending");
  for (let i = 0; i < 20; i++) {
    const { data, error } = await admin.rpc("worker_claim_import", { p_worker_id: "pruebas", p_lease_seconds: 120 });
    if (error) throw error;
    if (!data) throw new Error("No había trabajos para tomar");
    const job = data as { id: string };
    if (job.id !== importId) {
      // Trabajo ajeno a esta prueba: se libera cancelándolo.
      await admin.from("imports").update({ status: "cancelled", stage: "cancelled", lock_token: null, locked_by: null, locked_until: null } as never).eq("id", job.id);
      continue;
    }
    await processImport(data as never, {
      db: admin,
      provider,
      leaseSeconds: 120,
      limits: { maxBytes: 20_000_000, minSide: 100, maxSide: 12000 },
      signal: new AbortController().signal,
    });
    return;
  }
  throw new Error("No se pudo tomar la importación");
}

export async function importRow(importId: string) {
  const { data } = await adminClient().from("imports").select("*").eq("id", importId).single();
  return data!;
}

export async function proposals(importId: string) {
  const { data } = await adminClient().from("import_proposals").select("*").eq("import_id", importId).order("position");
  return data ?? [];
}

/** Cancela trabajos pendientes que hayan quedado de corridas anteriores. */
export async function drainQueue() {
  await adminClient()
    .from("imports")
    .update({ status: "cancelled", stage: "cancelled", lock_token: null, locked_by: null, locked_until: null } as never)
    .in("status", ["pending", "processing"]);
}
