import type { AppError } from "./errors";

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: AppError; fieldErrors?: Record<string, string> };
