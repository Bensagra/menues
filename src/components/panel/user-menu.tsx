"use client";

import Link from "next/link";
import { ArrowLeftRight, LogOut, ShieldCheck, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function UserMenu({ email, isAdmin, roleLabel }: { email: string; isAdmin: boolean; roleLabel: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="w-full justify-start gap-3 px-2" aria-label={`Cuenta: ${email}`}>
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-primary">
            <UserRound className="size-4" aria-hidden="true" />
          </span>
          <span className="min-w-0 text-left">
            <span className="block truncate text-sm font-semibold">{email}</span>
            <span className="block text-xs font-medium text-muted-foreground">{roleLabel}</span>
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="truncate">{email}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/cuenta">
            <UserRound aria-hidden="true" /> Mi cuenta
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/panel?elegir=1">
            <ArrowLeftRight aria-hidden="true" /> Cambiar de negocio
          </Link>
        </DropdownMenuItem>
        {isAdmin && (
          <DropdownMenuItem asChild>
            <Link href="/admin">
              <ShieldCheck aria-hidden="true" /> Administración
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <form action="/auth/salir" method="post">
          <DropdownMenuItem asChild>
            <button type="submit" className="w-full">
              <LogOut aria-hidden="true" /> Cerrar sesión
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
