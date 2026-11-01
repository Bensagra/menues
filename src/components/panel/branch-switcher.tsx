"use client";

import { MapPin } from "lucide-react";
import { useAction } from "@/hooks/use-action";
import { setActiveBranchAction } from "@/server/actions/panel";
import { NativeSelect } from "@/components/app/native-select";

export function BranchSwitcher({
  businessId,
  branches,
  activeBranchId,
  compact,
}: {
  businessId: string;
  branches: { id: string; name: string }[];
  activeBranchId: string | null;
  compact?: boolean;
}) {
  const { run, pending } = useAction(setActiveBranchAction);
  if (branches.length <= 1) {
    const branch = branches[0];
    return branch ? (
      <p className="flex min-h-11 items-center gap-1.5 text-sm text-muted-foreground">
        <MapPin className="size-4 shrink-0" aria-hidden="true" />
        <span className="sr-only">Sucursal activa:</span>
        <span className="truncate font-medium text-foreground">{branch.name}</span>
      </p>
    ) : null;
  }
  return (
    <label className="grid gap-1">
      <span className={compact ? "sr-only" : "text-xs font-semibold text-muted-foreground"}>Sucursal activa</span>
      <NativeSelect
        value={activeBranchId ?? ""}
        disabled={pending}
        aria-busy={pending}
        onChange={(event) => run(businessId, event.target.value)}
      >
        {branches.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </NativeSelect>
    </label>
  );
}
