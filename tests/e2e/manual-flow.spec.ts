import { expect, test } from "@playwright/test";
import { confirmationToken, unique } from "./support";

test.describe("alta y carga manual", () => {
  test("registro → configuración → carga manual → publicación → consulta pública", async ({ page }) => {
    const email = `${unique("registro")}@pruebas.test`;
    const businessName = `Fonda ${unique("e2e").slice(4)}`;

    // Registro con confirmación de email (Mailpit local).
    await page.goto("/registrarse");
    await page.getByLabel("Tu nombre").fill("Ana Prueba");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Contraseña").fill("ClaveSegura2026");
    await page.getByRole("button", { name: "Crear cuenta" }).click();
    await expect(page.getByText("Revisá tu email")).toBeVisible();
    const token = await confirmationToken(email);
    await page.goto(`/auth/confirm?token_hash=${token}&type=email&next=/bienvenida`);

    // Configuración inicial: negocio y primera sucursal.
    await expect(page.getByRole("heading", { name: "Creá tu negocio" })).toBeVisible();
    await page.getByLabel("Nombre del negocio").fill(businessName);
    await page.getByLabel("Nombre de la sucursal").fill("Centro");
    const panelSlug = await page.getByLabel("Identificador del panel").inputValue();
    const branchSlug = await page.getByLabel("Dirección de la carta pública").inputValue();
    expect(branchSlug).toMatch(/^[a-z0-9-]+$/);
    await page.getByRole("button", { name: "Crear negocio y seguir" }).click();
    await expect(page.getByRole("heading", { name: "¿Cómo querés cargar tu carta?" })).toBeVisible();
    await page.getByRole("link", { name: /Cargala a mano/ }).click();

    // Carga manual: categoría y producto.
    await page.getByRole("button", { name: "Crear la primera categoría" }).click();
    await page.getByRole("dialog").getByLabel("Nombre").fill("Principales");
    await page.getByRole("button", { name: "Crear categoría" }).click();
    await page.getByRole("button", { name: "Agregar producto" }).first().click();
    const sheet = page.getByRole("dialog");
    await sheet.getByRole("textbox", { name: "Nombre" }).fill("Milanesa napolitana");
    await sheet.getByRole("textbox", { name: /^Descripción/ }).fill("Con papas fritas.");
    await sheet.getByRole("textbox", { name: /^Precio/ }).fill("12.500");
    await sheet.getByRole("button", { name: "Guardar borrador" }).click();
    await expect(sheet).toBeHidden();
    await expect(page.getByText("Milanesa napolitana")).toBeVisible();

    // La carta pública todavía no existe: nada se publica sin confirmarlo.
    await page.goto(`/m/${branchSlug}`);
    await expect(page.getByText(/todavía no publicó su carta/)).toBeVisible();

    // Configuración del local.
    await page.goto(`/panel/${panelSlug}/configuracion`);
    await page.getByLabel("Descripción breve").fill("Cocina casera todos los días.");
    await page.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(page.getByText("Guardaste los datos del local.")).toBeVisible();

    // Publicación.
    await page.goto(`/panel/${panelSlug}/menus`);
    await page.getByRole("main").getByRole("link", { name: "Carta", exact: true }).click();
    await page.getByRole("button", { name: "Publicar", exact: true }).click();
    const publish = page.getByRole("dialog");
    await publish.getByRole("button", { name: /^Publicar/ }).click();
    await expect(publish.getByText("Carta publicada")).toBeVisible();

    // Consulta pública (sin sesión).
    const visitor = await page.context().browser()!.newContext({ locale: "es-AR", timezoneId: "America/Argentina/Buenos_Aires" });
    const publicPage = await visitor.newPage();
    await publicPage.goto(`/m/${branchSlug}`);
    await expect(publicPage.getByRole("heading", { name: businessName, exact: true })).toBeVisible();
    await expect(publicPage.getByText("Cocina casera todos los días.")).toBeVisible();
    await expect(publicPage.getByText("Milanesa napolitana")).toBeVisible();
    await expect(publicPage.getByText("$ 12.500").first()).toBeVisible();
    await visitor.close();
  });
});
