// Genera una imagen de carta de prueba: npx tsx scripts/dev/make-menu-image.ts <salida.jpg>
import { writeFileSync } from "node:fs";
import { menuImage } from "../../tests/helpers/menu-image";

async function main() {
  const out = process.argv[2] ?? "carta-prueba.jpg";
  const img = await menuImage(
    ["# PIZZAS", "Muzzarella  chica $12.500  grande $17.900", "Fugazzeta rellena  $22.000", "# POSTRES", "Flan casero con dulce de leche  $7.?00", "Volcán de chocolate  $9.500"],
    { seed: process.argv[3] ?? "manual" },
  );
  writeFileSync(out, img);
  console.log(`✔ ${out} (${img.length} bytes)`);
}
void main();
