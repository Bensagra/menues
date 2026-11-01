/**
 * Otorga o revoca el rol de administrador de plataforma. Es el ÚNICO camino
 * para crear administradores: no existe ninguna opción pública en la app.
 *
 *   npm run admin:grant -- --email persona@empresa.com [--note "Soporte"]
 *   npm run admin:revoke -- --email persona@empresa.com
 *
 * Requisitos: la persona ya se registró y confirmó su email; el script usa la
 * clave secreta de Supabase (SUPABASE_SECRET_KEY), que solo existe en el
 * servidor de quien opera la plataforma.
 */
import { userInfo } from "node:os";
import { arg, db, fail } from "./_shared";

async function main() {
  const action = process.argv[2];
  const email = arg("email");
  if (action !== "grant" && action !== "revoke") fail("Uso: platform-admin.ts grant|revoke --email ...");
  if (!email || email === "true") fail("Indicá --email");
  const operator = `cli:${userInfo().username}`;
  const admin = db();

  if (action === "grant") {
    const { data, error } = await admin.rpc("server_grant_platform_admin", {
      p_email: email,
      p_granted_by: operator,
      p_note: arg("note") && arg("note") !== "true" ? arg("note")! : "",
    });
    if (error) {
      if (error.message === "user_not_found") fail("No hay una cuenta con ese email. La persona tiene que registrarse primero.");
      if (error.message === "email_not_confirmed") fail("La cuenta todavía no confirmó su email.");
      fail(error.message);
    }
    console.log(`✔ ${(data as { email: string }).email} es administrador de la plataforma.`);
  } else {
    const { data, error } = await admin.rpc("server_revoke_platform_admin", { p_email: email, p_revoked_by: operator });
    if (error) fail(error.message);
    console.log(data ? `✔ Se revocó el acceso de administrador de ${email}.` : `No había acceso de administrador para ${email}.`);
  }
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
