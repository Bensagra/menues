import { randomBytes } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/service";

export function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return undefined;
  const value = process.argv[index + 1];
  return value && !value.startsWith("--") ? value : "true";
}

export function isLocalSupabase(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(url);
}

export function randomPassword(): string {
  // 18 bytes → 24 caracteres; incluye letras y números como exige la política de contraseñas.
  return `${randomBytes(18).toString("base64url")}9a`;
}

export function db() {
  return createServiceClient();
}

export async function findUserByEmail(email: string) {
  const admin = db();
  for (let page = 1; page < 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const match = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (match) return match;
    if (data.users.length < 200) return null;
  }
  return null;
}

export function fail(message: string): never {
  console.error(`✖ ${message}`);
  process.exit(1);
}
