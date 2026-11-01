import { expect, test } from "@playwright/test";

// Carta pública del seed en un teléfono: se lee sin desbordes y la búsqueda responde.
test("carta pública en mobile @mobile", async ({ page }) => {
  await page.goto("/m/casa-oliva-palermo");
  await expect(page.getByRole("heading", { name: "Casa Oliva", exact: true })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.getByLabel("Buscar en la carta").fill("zzzz inexistente");
  await expect(page.getByText("No encontramos «zzzz inexistente»")).toBeVisible();
  await page.getByRole("button", { name: "Ver toda la carta" }).click();
  await expect(page.getByRole("heading", { name: "Entradas" })).toBeVisible();
});
