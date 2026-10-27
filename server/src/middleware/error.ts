import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { HttpError } from '../utils/httpError.js';

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ error: 'Route not found' });
};

interface MongoDuplicateKeyError {
  code: 11000;
  keyValue?: Record<string, unknown>;
}

const isDuplicateKey = (error: unknown): error is MongoDuplicateKeyError =>
  typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 11000;

/** Translates thrown errors into consistent `{ error, details? }` JSON responses. */
export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof HttpError) {
    res.status(error.status).json({ error: error.message, details: error.details });
    return;
  }

  if (error instanceof ZodError) {
    res.status(400).json({
      error: error.issues[0]?.message ?? 'Invalid input',
      details: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    });
    return;
  }

  if (isDuplicateKey(error)) {
    const field = Object.keys(error.keyValue ?? {})[0] ?? 'value';
    res.status(409).json({ error: `That ${field} is already taken` });
    return;
  }

  // Errors raised by body-parser (malformed JSON, payload too large, …).
  const status = (error as { status?: number }).status;
  if (typeof status === 'number' && status >= 400 && status < 500) {
    res.status(status).json({ error: (error as Error).message });
    return;
  }

  console.error(error);
  res.status(500).json({ error: 'Internal server error' });
};
