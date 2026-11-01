import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { adminClient, userWithBusiness } from "./support";

const rgb = (hex: string) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(", ")})`;

test.describe("diseño de la carta", () => {
  test("propuesta a medida (simulada) → vista previa → aplicar → carta pública con el diseño", async ({ page }) => {
    const account = await userWithBusiness("Bodegón E2E");
    const { data: category } = await account.client.rpc("create_category", { p_menu_id: account.menuId, p_name: "Principales" });
    await account.client.rpc("save_product", {
      p_payload: {
        id: null,
        menu_id: account.menuId,
        category_id: category,
        name: "Milanesa napolitana",
        description: "Con papas fritas.",
        price_minor: 1250000,
        status: "available",
        tags: [],
        image_media_id: null,
        variants: [],
        extras: [],
      },
    });
    const { data: branches } = await account.client.from("branches").select("id").eq("public_slug", account.branchSlug);
    await account.client.rpc("publish_menu", { p_menu_id: account.menuId, p_branch_ids: [branches![0].id], p_idempotency_key: randomUUID() });

    await page.goto(`/ingresar?volver=/panel/${account.slug}/diseno`);
    await page.getByLabel("Email").fill(account.email);
    await page.getByLabel("Contraseña").fill(account.password);
    await page.getByRole("button", { name: "Ingresar" }).click();
    await expect(page.getByRole("heading", { name: "Diseño de la carta" })).toBeVisible();

    // La vista previa usa los productos reales del borrador.
    const preview = page.getByLabel("Vista previa de la carta");
    await expect(preview.getByText("Milanesa napolitana")).toBeVisible();

    await page.getByLabel(/Sitio web del local/).fill("instagram.com/bodegon");
    await expect(page.getByText(/no se pueden leer sin iniciar sesión/)).toBeVisible();
    await page.getByLabel(/Sitio web del local/).fill("");
    await page.getByRole("button", { name: "Proponer un diseño" }).click();
    await expect(page.getByText("Estamos armando tu propuesta…")).toBeVisible();

    // El worker (proveedor simulado) arma la propuesta; siempre se anuncia como simulada.
    await expect(page.getByText("Tu propuesta está lista")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText("Resultado simulado (modo de prueba)")).toBeVisible();
    await expect(page.getByRole("button", { name: "Propuesta", pressed: true })).toBeVisible();

    await page.getByRole("button", { name: "Aplicar a mi carta" }).click();
    await expect(page.getByText("Aplicaste la última propuesta.")).toBeVisible();

    const { data: business } = await adminClient().from("businesses").select("theme").eq("slug", account.slug).single();
    const theme = business!.theme as { colors: { accent: string; background: string } };

    const visitor = await page.context().browser()!.newContext({ locale: "es-AR" });
    const publicPage = await visitor.newPage();
    await publicPage.goto(`/m/${account.branchSlug}`);
    await expect(publicPage.getByRole("heading", { level: 1, name: "Bodegón E2E" })).toHaveCSS("color", rgb(theme.colors.accent));
    await expect(publicPage.locator("body")).toHaveCSS("background-color", rgb(theme.colors.background));
    await visitor.close();

    // Ajuste a mano: un color ilegible se avisa y se corrige antes de guardar.
    await page.getByLabel("Texto secundario", { exact: true }).fill(theme.colors.background);
    await expect(page.getByText("El texto secundario no se lee bien sobre el fondo.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Guardar diseño" })).toBeDisabled();
    await page.getByRole("button", { name: "Corregir contraste" }).click();
    await expect(page.getByText("El texto secundario no se lee bien sobre el fondo.")).toBeHidden();
    await page.getByRole("button", { name: "Guardar diseño" }).click();
    await expect(page.getByText("Guardado. Tu carta ya se ve así.")).toBeVisible();
  });
});
