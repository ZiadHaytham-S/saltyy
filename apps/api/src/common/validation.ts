import { BadRequestException } from '@nestjs/common';
import type { z } from 'zod';
export function validate<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of result.error.issues) {
      const field = String(issue.path[0] ?? 'form');
      (fieldErrors[field] ??= []).push(issue.message);
    }
    throw new BadRequestException({
      code: 'VALIDATION_ERROR',
      message: 'راجع البيانات اللي كتبتها',
      fieldErrors,
    });
  }
  return result.data;
}
export function isDuplicateKey(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 11000
  );
}
