import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { menuImage } from "../helpers/menu-image";
import { userWithBusiness } from "./support";

test.describe("actualización con fotos", () => {
  test("importación con proveedor simulado → revisión → publicación", async ({ page }) => {
    const account = await userWithBusiness("Pizzería E2E");

    await page.goto(`/ingresar?volver=/panel/${account.slug}/actualizar`);
    await page.getByLabel("Email").fill(account.email);
    await page.getByLabel("Contraseña").fill(account.password);
    await page.getByRole("button", { name: "Ingresar" }).click();
    await expect(page.getByRole("heading", { name: "Actualizar con una foto" })).toBeVisible();
    // El proveedor simulado siempre se anuncia como tal.
    await expect(page.getByText("Modo de prueba: los resultados son simulados.")).toBeVisible();

    const dir = mkdtempSync(path.join(tmpdir(), "cartalista-e2e-"));
    const file = path.join(dir, "carta.jpg");
    writeFileSync(file, await menuImage(["# PIZZAS", "Muzzarella chica 12.500 grande 17.900", "# POSTRES", "Flan casero 7.?00"]));
    await page.locator('input[type="file"][multiple]').setInputFiles(file);
    await page.getByRole("button", { name: "Procesar 1 foto" }).click();

    // El worker procesa en segundo plano; la página muestra el avance y después la revisión.
    await expect(page).toHaveURL(/\/actualizar\/[0-9a-f-]{36}/, { timeout: 30_000 });
    await expect(page.getByText("Resultado simulado (modo de prueba)").first()).toBeVisible({ timeout: 90_000 });
    const approveValid = page.getByRole("button", { name: /Aprobar los válidos/ });
    await expect(approveValid).toBeVisible({ timeout: 90_000 });
    await approveValid.click();

    // El precio ilegible nunca se carga como cero: queda "por revisar" y se corrige a mano.
    const flan = page.getByRole("article").filter({ hasText: "Flan casero con dulce de leche" });
    await expect(flan.getByText("Precio ilegible").first()).toBeVisible();
    await flan.getByRole("button", { name: "Corregir" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("textbox", { name: /^Precio/ }).fill("7.800");
    await dialog.getByRole("button", { name: "Aprobar con estos datos" }).click();
    await expect(dialog).toBeHidden();

    await page.getByRole("button", { name: /al borrador$/ }).click();
    await expect(page.getByText(/Aplicaste \d+ cambios? al borrador/)).toBeVisible();

    // La carta pública sigue sin publicar hasta confirmar.
    await page.getByRole("button", { name: "Publicar ahora" }).click();
    const publish = page.getByRole("dialog");
    await publish.getByRole("button", { name: /^Publicar/ }).click();
    await expect(publish.getByText("Carta publicada")).toBeVisible();

    const visitor = await page.context().browser()!.newContext({ locale: "es-AR" });
    const publicPage = await visitor.newPage();
    await publicPage.goto(`/m/${account.branchSlug}`);
    await expect(publicPage.getByText("Muzzarella")).toBeVisible();
    await expect(publicPage.getByText("Flan casero con dulce de leche")).toBeVisible();
    await expect(publicPage.getByText("$ 7.800").first()).toBeVisible();
    await visitor.close();
  });
});
