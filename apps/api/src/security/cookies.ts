import { createHash, timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';
import { environment } from '../config/env.js';
export const SESSION_SECONDS = 7 * 24 * 60 * 60;
export const IDLE_MS = 24 * 60 * 60 * 1000;
export const cookieNames = {
  session:
    environment.NODE_ENV === 'production'
      ? '__Host-sallty_session'
      : 'sallty_session',
  csrf:
    environment.NODE_ENV === 'production'
      ? '__Host-sallty_csrf'
      : 'sallty_csrf',
};
export function tokenHash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
export function readCookie(request: Request, name: string): string | undefined {
  const found = (request.headers.cookie ?? '')
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.startsWith(name + '='));
  if (found.length !== 1) return undefined;
  const value = found[0]?.slice(name.length + 1);
  return value && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : undefined;
}
export function equal(left: string, right: string): boolean {
  const a = Buffer.from(left),
    b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
export function setCookie(
  response: Response,
  name: string,
  value: string,
  seconds: number,
) {
  response.cookie(name, value, {
    httpOnly: true,
    secure: environment.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: seconds * 1000,
  });
}
export function clearCookie(response: Response, name: string) {
  response.clearCookie(name, {
    httpOnly: true,
    secure: environment.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  });
}
