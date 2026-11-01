"use server";

import { cookies } from "next/headers";
import { refresh } from "next/cache";
import { z } from "zod";
import { BRANCH_COOKIE_PREFIX } from "@/server/auth";
import { authedAction, fail, parseInput, rpc } from "@/server/action";

/** Cambia la sucursal activa. Se valida con RLS que el usuario tenga acceso. */
export async function setActiveBranchAction(businessId: string, branchId: string) {
  return authedAction(async ({ supabase }) => {
    const ids = parseInput(z.object({ businessId: z.string().uuid(), branchId: z.string().uuid() }), { businessId, branchId });
    const { data } = await supabase.from("branches").select("id").eq("id", ids.branchId).eq("business_id", ids.businessId).maybeSingle();
    if (!data) fail("not_found");
    const store = await cookies();
    store.set(`${BRANCH_COOKIE_PREFIX}${ids.businessId}`, ids.branchId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
    refresh();
    return null;
  });
}

export async function updateMyProfileAction(fullName: string) {
  return authedAction(async ({ supabase }) => {
    const name = parseInput(z.string().trim().min(2, "Escribí tu nombre.").max(120), fullName);
    await rpc(supabase, "update_my_profile", { p_full_name: name });
    refresh();
    return null;
  });
}
