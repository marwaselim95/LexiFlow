// Shared HTTP error response factory for consistent API error shapes.
import { HttpException } from '@nestjs/common';

export function error(type: string, message: string, status: number): HttpException {
  return new HttpException({ error: { type, message } }, status);
}
