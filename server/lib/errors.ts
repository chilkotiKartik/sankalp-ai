import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { logger } from "./logger";

/** Errors that are safe to show to clients. Anything else becomes a generic 500 (m1). */
export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const badRequest = (msg: string, details?: unknown) => new AppError(400, "BAD_REQUEST", msg, details);
export const unauthorized = (msg = "Unauthorized") => new AppError(401, "UNAUTHORIZED", msg);
export const forbidden = (msg = "Forbidden") => new AppError(403, "FORBIDDEN", msg);
export const notFound = (msg = "Not found") => new AppError(404, "NOT_FOUND", msg);
export const conflict = (msg: string) => new AppError(409, "CONFLICT", msg);
export const unprocessable = (code: string, msg: string) => new AppError(422, code, msg);

export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction) {
  if (res.headersSent) return next(err);
  if (err instanceof AppError) {
    return res.status(err.status).json({ code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) });
  }
  if (err instanceof ZodError) {
    return res.status(400).json({
      code: "VALIDATION_FAILED",
      message: "Request validation failed",
      details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }
  const e = err as { status?: number; type?: string };
  if (e?.type === "entity.too.large" || e?.status === 413) {
    return res.status(413).json({ code: "PAYLOAD_TOO_LARGE", message: "Request body too large" });
  }
  if (e?.type === "entity.parse.failed") {
    return res.status(400).json({ code: "INVALID_JSON", message: "Malformed JSON body" });
  }
  const requestId = (req as Request & { id?: string }).id;
  logger.error("unhandled_error", { reqId: requestId, path: req.path, method: req.method, err });
  return res.status(500).json({ code: "INTERNAL", message: "Internal server error", requestId });
}

/** Unref a timer handle regardless of whether DOM or Node typings are in scope. */
export function unref(t: unknown): void {
  (t as { unref?: () => void } | null)?.unref?.();
}
