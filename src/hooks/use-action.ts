"use client";

import { useCallback, useState, useTransition } from "react";
import type { ActionResult } from "@/lib/action-result";
import { appError, type AppError } from "@/lib/errors";

/**
 * Ejecuta una Server Action y expone estado de envío y errores para mostrarlos
 * en la pantalla (no solo con toasts).
 */
export function useAction<A extends unknown[], T>(action: (...args: A) => Promise<ActionResult<T>>) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<AppError | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const run = useCallback(
    (...args: A) =>
      new Promise<ActionResult<T>>((resolve) => {
        startTransition(async () => {
          try {
            const result = await action(...args);
            if (result.ok) {
              setError(null);
              setFieldErrors({});
            } else {
              setError(result.error);
              setFieldErrors(result.fieldErrors ?? {});
            }
            resolve(result);
          } catch {
            const err = appError("network");
            setError(err);
            resolve({ ok: false, error: err });
          }
        });
      }),
    [action],
  );

  const reset = useCallback(() => {
    setError(null);
    setFieldErrors({});
  }, []);

  return { run, pending, error, fieldErrors, reset, setError };
}
