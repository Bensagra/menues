"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { publicEnv } from "@/lib/env";
import { appError } from "@/lib/errors";
import { safeInternalPath } from "@/lib/safe-redirect";
import { createClient } from "@/server/supabase/server";
import { getCurrentUser } from "@/server/auth";

const email = z.string().trim().toLowerCase().email("Revisá el email.").max(254);
const password = z
  .string()
  .min(8, "Usá al menos 8 caracteres.")
  .max(72, "Usá como máximo 72 caracteres.")
  .regex(/[a-zA-Z]/, "Incluí al menos una letra.")
  .regex(/\d/, "Incluí al menos un número.");

function fieldErrors(error: z.ZodError) {
  return Object.fromEntries(error.issues.map((i) => [String(i.path[0]), i.message]));
}

function authErrorCode(message: string | undefined): string {
  const m = (message ?? "").toLowerCase();
  if (m.includes("invalid login credentials")) return "invalid_credentials";
  if (m.includes("email not confirmed")) return "email_not_confirmed";
  if (m.includes("already registered") || m.includes("already been registered")) return "already_registered";
  if (m.includes("rate limit") || m.includes("too many")) return "rate_limited";
  if (m.includes("weak") || m.includes("password should")) return "weak_password";
  if (m.includes("same password") || m.includes("different from the old")) return "same_password";
  return "auth_unknown";
}

const AUTH_MESSAGES: Record<string, string> = {
  invalid_credentials: "Email o contraseña incorrectos.",
  email_not_confirmed: "Todavía no confirmaste tu email. Revisá tu bandeja de entrada o pedí un enlace nuevo.",
  already_registered: "Ya hay una cuenta con ese email. Ingresá o recuperá tu contraseña.",
  rate_limited: "Hiciste muchos intentos seguidos. Esperá unos minutos y probá de nuevo.",
  weak_password: "La contraseña es muy débil. Usá al menos 8 caracteres con letras y números.",
  same_password: "La contraseña nueva tiene que ser distinta de la anterior.",
  auth_unknown: "No pudimos completar la operación. Probá de nuevo en unos segundos.",
};

function authFailure(code: string): { ok: false; error: { code: string; message: string } } {
  return { ok: false, error: { code, message: AUTH_MESSAGES[code] ?? AUTH_MESSAGES.auth_unknown } };
}

export async function signInAction(input: { email: string; password: string; next?: string }): Promise<ActionResult<{ redirectTo: string }>> {
  const parsed = z.object({ email, password: z.string().min(1, "Ingresá tu contraseña.") }).safeParse(input);
  if (!parsed.success) return { ok: false, error: appError("validation"), fieldErrors: fieldErrors(parsed.error) };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return authFailure(authErrorCode(error.message));
  return { ok: true, data: { redirectTo: safeInternalPath(input.next, publicEnv().appUrl) } };
}

export async function signUpAction(input: {
  fullName: string;
  email: string;
  password: string;
  next?: string;
}): Promise<ActionResult<{ needsConfirmation: boolean; redirectTo: string }>> {
  const parsed = z
    .object({ fullName: z.string().trim().min(2, "Escribí tu nombre.").max(120), email, password })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: appError("validation"), fieldErrors: fieldErrors(parsed.error) };
  const env = publicEnv();
  const next = safeInternalPath(input.next, env.appUrl, "/bienvenida");
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { data: { full_name: parsed.data.fullName }, emailRedirectTo: `${env.appUrl}${next.split("?")[0]}` },
  });
  if (error) return authFailure(authErrorCode(error.message));
  // Con confirmación de email activa, Supabase no revela si el email ya existía.
  return { ok: true, data: { needsConfirmation: !data.session, redirectTo: next } };
}

export async function resendConfirmationAction(input: { email: string; next?: string }): Promise<ActionResult> {
  const parsed = email.safeParse(input.email);
  if (!parsed.success) return { ok: false, error: appError("validation"), fieldErrors: { email: "Revisá el email." } };
  const env = publicEnv();
  const next = safeInternalPath(input.next, env.appUrl, "/bienvenida");
  const supabase = await createClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email: parsed.data,
    options: { emailRedirectTo: `${env.appUrl}${next.split("?")[0]}` },
  });
  if (error && authErrorCode(error.message) === "rate_limited") return authFailure("rate_limited");
  return { ok: true, data: undefined };
}

export async function requestPasswordResetAction(input: { email: string }): Promise<ActionResult> {
  const parsed = email.safeParse(input.email);
  if (!parsed.success) return { ok: false, error: appError("validation"), fieldErrors: { email: "Revisá el email." } };
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, {
    redirectTo: `${publicEnv().appUrl}/restablecer`,
  });
  if (error && authErrorCode(error.message) === "rate_limited") return authFailure("rate_limited");
  // Respuesta idéntica exista o no la cuenta (evita enumerar usuarios).
  return { ok: true, data: undefined };
}

export async function updatePasswordAction(input: { password: string; confirm: string }): Promise<ActionResult> {
  const parsed = z
    .object({ password, confirm: z.string() })
    .refine((v) => v.password === v.confirm, { message: "Las contraseñas no coinciden.", path: ["confirm"] })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: appError("validation"), fieldErrors: fieldErrors(parsed.error) };
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: appError("session_expired") };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return authFailure(authErrorCode(error.message));
  return { ok: true, data: undefined };
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/ingresar?motivo=salida");
}
