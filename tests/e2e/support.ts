import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

// Variables de Supabase local (.env.local). Las pruebas e2e nunca corren contra un proyecto alojado.
const file = path.join(process.cwd(), ".env.local");
if (existsSync(file)) {
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2];
  }
}
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(SUPABASE_URL)) {
  throw new Error("Las pruebas e2e solo corren contra Supabase local (npm run db:start).");
}
const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";

export const unique = (prefix: string) => `${prefix}-${randomUUID().slice(0, 8)}`;

export function adminClient() {
  return createClient(SUPABASE_URL, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Espera el email de confirmación en Mailpit y devuelve el token_hash del enlace. */
export async function confirmationToken(email: string): Promise<string> {
  for (let attempt = 0; attempt < 30; attempt++) {
    const search = await fetch(`${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`);
    const { messages } = (await search.json()) as { messages: { ID: string }[] };
    if (messages?.length) {
      const message = (await (await fetch(`${MAILPIT_URL}/api/v1/message/${messages[0].ID}`)).json()) as { HTML: string; Text: string };
      const match = /token_hash=([A-Za-z0-9_-]+)/.exec(`${message.HTML} ${message.Text}`);
      if (match) return match[1];
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`No llegó el email de confirmación para ${email}`);
}

/** Usuario confirmado con un negocio, creado por la API (para pruebas que no prueban el registro). */
export async function userWithBusiness(name: string) {
  const email = `${unique("e2e")}@pruebas.test`;
  const password = `Clave-${randomUUID()}1a`;
  const admin = adminClient();
  const { error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "Prueba E2E" } });
  if (error) throw error;
  const client = createClient(SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;
  const slug = unique("neg");
  const branchSlug = unique("suc");
  const { data, error: rpcError } = await client.rpc("create_business", {
    p_name: name,
    p_slug: slug,
    p_currency: "ARS",
    p_branch_name: "Centro",
    p_branch_slug: branchSlug,
    p_timezone: "America/Argentina/Buenos_Aires",
  });
  if (rpcError) throw rpcError;
  return { email, password, slug, branchSlug, menuId: (data as { menu_id: string }).menu_id, client };
}
