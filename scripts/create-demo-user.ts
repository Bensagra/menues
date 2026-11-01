/**
 * Crea (o reutiliza) un usuario de prueba con acceso a un negocio del seed.
 * Solo contra Supabase LOCAL, salvo que se pase --allow-remote explícitamente.
 *
 *   npm run demo:user -- --email vos@ejemplo.com [--business casa-oliva] [--role owner|admin|editor]
 *                        [--branches casa-oliva-palermo] [--can-publish] [--password ...]
 *   npm run demo:user -- --email vos@ejemplo.com --no-business    (solo la cuenta, p. ej. para admin:grant)
 *
 * Si no se indica --password, se genera una aleatoria y se muestra una sola vez.
 * No se crean credenciales fijas ni públicas.
 */
import { arg, db, fail, findUserByEmail, isLocalSupabase, randomPassword } from "./_shared";

async function main() {
  const email = arg("email");
  if (!email || email === "true") fail("Indicá --email");
  if (!isLocalSupabase() && arg("allow-remote") !== "true") {
    fail("NEXT_PUBLIC_SUPABASE_URL no es local. Este script es para desarrollo; usá --allow-remote solo si sabés lo que hacés.");
  }
  const noBusiness = arg("no-business") === "true";
  const slug = arg("business") ?? "casa-oliva";
  const role = (arg("role") ?? "owner") as "owner" | "admin" | "editor";
  if (!["owner", "admin", "editor"].includes(role)) fail("--role debe ser owner, admin o editor");
  const branchSlugs = (arg("branches") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const canPublish = role !== "editor" || arg("can-publish") === "true";
  const admin = db();

  const { data: business } = noBusiness ? { data: null } : await admin.from("businesses").select("id, name").eq("slug", slug).maybeSingle();
  if (!business && !noBusiness) fail(`No existe el negocio «${slug}». ¿Corriste npm run db:reset?`);

  let user = await findUserByEmail(email);
  let password: string | null = null;
  if (!user) {
    password = arg("password") && arg("password") !== "true" ? arg("password")! : randomPassword();
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: arg("name") ?? (noBusiness ? "Cuenta de prueba" : `Demo ${role}`) },
    });
    if (error || !data.user) fail(`No se pudo crear el usuario: ${error?.message}`);
    user = data.user;
  }

  if (!business) {
    console.log(`✔ Cuenta ${email} lista (sin acceso a negocios).`);
    if (password) console.log(`  Contraseña (se muestra una sola vez): ${password}`);
    else console.log("  El usuario ya existía: su contraseña no cambió.");
    return;
  }

  const allBranches = role !== "editor" || branchSlugs.length === 0;
  const { data: membership, error: membershipError } = await admin
    .from("memberships")
    .upsert(
      {
        business_id: business.id,
        user_id: user.id,
        role,
        can_publish: role === "editor" ? canPublish : true,
        all_branches: allBranches,
        status: "active",
        revoked_at: null,
        revoked_by: null,
      },
      { onConflict: "business_id,user_id" },
    )
    .select("id")
    .single();
  if (membershipError || !membership) fail(`No se pudo crear la membresía: ${membershipError?.message}`);

  await admin.from("membership_branches").delete().eq("membership_id", membership.id);
  if (!allBranches) {
    const { data: branches } = await admin.from("branches").select("id, public_slug").eq("business_id", business.id).in("public_slug", branchSlugs);
    if (!branches?.length) fail("No se encontraron las sucursales indicadas en --branches");
    await admin.from("membership_branches").insert(branches.map((b) => ({ business_id: business.id, membership_id: membership.id, branch_id: b.id })));
  }

  console.log(`✔ ${email} tiene acceso a ${business.name} como ${role}${role === "editor" ? (canPublish ? " (puede publicar)" : " (sin permiso de publicar)") : ""}.`);
  if (password) console.log(`  Contraseña (se muestra una sola vez): ${password}`);
  else console.log("  El usuario ya existía: su contraseña no cambió.");
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
