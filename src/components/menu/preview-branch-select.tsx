"use client";

import { usePathname, useRouter } from "next/navigation";

export function PreviewBranchSelect({ branches, value }: { branches: { id: string; name: string }[]; value: string }) {
  const router = useRouter();
  const pathname = usePathname();
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="font-semibold">Sucursal</span>
      <select
        className="h-11 rounded-lg border border-input bg-card px-3 text-foreground"
        value={value}
        onChange={(e) => router.replace(`${pathname}?sucursal=${e.target.value}`)}
      >
        {branches.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
    </label>
  );
}
