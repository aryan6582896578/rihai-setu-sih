import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }

  static badRequest(message: string, details?: unknown) {
    return new ApiError(400, "VALIDATION_ERROR", message, details);
  }
  static unauthorized(message = "Authentication required") {
    return new ApiError(401, "UNAUTHORIZED", message);
  }
  static forbidden(message = "You do not have permission to perform this action", code = "FORBIDDEN") {
    return new ApiError(403, code, message);
  }
  static notFound(message = "Resource not found") {
    return new ApiError(404, "NOT_FOUND", message);
  }
  static conflict(message: string) {
    return new ApiError(409, "CONFLICT", message);
  }
}

type AsyncHandlerFn<R extends Request> = (
  req: R,
  res: Response,
  next: NextFunction,
) => Promise<unknown>;

export const asyncHandler =
  <R extends Request>(fn: AsyncHandlerFn<R>) =>
  (req: Request, res: Response, next: NextFunction): void => {
    fn(req as R, res, next).catch(next);
  };

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: { code: "NOT_FOUND", message: "Endpoint not found" } });
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      },
    });
    return;
  }
  if (err instanceof ApiError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message } });
    return;
  }
  // eslint-disable-next-line no-console
  console.error("[unhandled]", err);
  res.status(500).json({ error: { code: "INTERNAL", message: "Something went wrong on our side" } });
}
