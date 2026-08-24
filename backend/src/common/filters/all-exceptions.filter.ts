import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Response, Request } from 'express';

// Normalized error shape the frontend maps to fallback UI.
// Port of supabase/functions/_shared/errors.ts
export type ErrorType = 'offline' | 'rate_limited' | 'timeout' | 'ai_error' | 'unknown';

function normalizeError(err: unknown): { error: { type: ErrorType; message: string } } {
  if (err instanceof Error) {
    const msg = err.message;
    const lower = msg.toLowerCase();

    if (
      msg.startsWith('GEMINI_RATE_LIMITED') ||
      msg.startsWith('GROQ_RATE_LIMITED') ||
      lower.includes('429') ||
      lower.includes('rate limit') ||
      lower.includes('quota')
    ) {
      return { error: { type: 'rate_limited', message: msg } };
    }
    if (
      msg.startsWith('GEMINI_TIMEOUT') ||
      msg.startsWith('GROQ_TIMEOUT') ||
      lower.includes('timeout') ||
      lower.includes('timed out') ||
      lower.includes('aborted')
    ) {
      return { error: { type: 'timeout', message: msg } };
    }
    if (
      msg.startsWith('GEMINI_FETCH_ERROR') ||
      msg.startsWith('GROQ_FETCH_ERROR') ||
      lower.includes('failed to fetch') ||
      lower.includes('networkerror') ||
      lower.includes('econnrefused')
    ) {
      return { error: { type: 'offline', message: msg } };
    }
    if (msg.startsWith('GEMINI_') || msg.startsWith('GROQ_') || msg.startsWith('AI_')) {
      return { error: { type: 'ai_error', message: msg } };
    }

    if (
      lower.includes('failed to fetch') ||
      lower.includes('networkerror') ||
      lower.includes('econnrefused')
    ) {
      return { error: { type: 'offline', message: msg } };
    }
    return { error: { type: 'unknown', message: msg } };
  }
  return { error: { type: 'unknown', message: String(err) } };
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let body: Record<string, any>;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const response = exception.getResponse();
      if (typeof response === 'string') {
        body = normalizeError(new Error(response));
      } else if (typeof response === 'object' && response !== null && 'error' in (response as any)) {
        // Already in the normalized { error: { type, message } } shape — pass through
        body = response as Record<string, any>;
      } else if (typeof response === 'object' && response !== null && 'message' in (response as any)) {
        const messages = (response as any).message;
        const message = Array.isArray(messages) ? messages.join('; ') : String(messages);
        body = normalizeError(new Error(message));
      } else {
        body = normalizeError(exception);
      }
    } else {
      body = normalizeError(exception);
    }

    console.error(`[errorResponse] ${req.method} ${req.url}`, body.error.type, body.error.message);

    res.status(status).json(body);
  }
}
