"use client";

import { RotateCw } from "lucide-react";
import { ActionError, SubmitButton } from "@/components/app/form";
import { useAction } from "@/hooks/use-action";
import { retryImportAction } from "@/server/actions/imports";

export function RetryImportButton({ importId }: { importId: string }) {
  const { run, pending, error } = useAction(retryImportAction);
  return (
    <>
      <SubmitButton type="button" pending={pending} pendingLabel="Reintentando…" onClick={() => void run(importId)}>
        <RotateCw aria-hidden="true" /> Reintentar
      </SubmitButton>
      <ActionError error={error} className="basis-full" />
    </>
  );
}
