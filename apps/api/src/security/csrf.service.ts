import { Injectable, ForbiddenException } from '@nestjs/common';
import { createHmac, randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';
import { environment } from '../config/env.js';
import {
  cookieNames,
  readCookie,
  setCookie,
  tokenHash,
  equal,
} from './cookies.js';
@Injectable()
export class CsrfService {
  private signature(request: Request, nonce: string, timestamp: string) {
    const binding = tokenHash(
      readCookie(request, cookieNames.session) ?? 'anonymous',
    );
    return createHmac('sha256', Buffer.from(environment.CSRF_SECRET, 'hex'))
      .update(JSON.stringify([binding, nonce, timestamp]))
      .digest('hex');
  }
  issue(request: Request, response: Response) {
    const nonce =
      readCookie(request, cookieNames.csrf) ??
      randomBytes(32).toString('base64url');
    const timestamp = String(Math.floor(Date.now() / 1000));
    setCookie(response, cookieNames.csrf, nonce, 3600);
    return {
      csrfToken:
        nonce +
        '.' +
        timestamp +
        '.' +
        this.signature(request, nonce, timestamp),
    };
  }
  verify(request: Request) {
    const token = request.headers['x-csrf-token'];
    const match =
      typeof token === 'string'
        ? /^([A-Za-z0-9_-]{43})\.(\d{10})\.([a-f0-9]{64})$/.exec(token)
        : null;
    const nonce = readCookie(request, cookieNames.csrf);
    if (!match || !nonce || !match[1] || !match[2] || !match[3])
      throw new ForbiddenException({
        code: 'CSRF_REJECTED',
        message: 'حدّث الصفحة وحاول تاني',
      });
    const age = Math.floor(Date.now() / 1000) - Number(match[2]);
    if (
      age < -30 ||
      age > 3600 ||
      !equal(nonce, match[1]) ||
      !equal(match[3], this.signature(request, nonce, match[2]))
    ) {
      throw new ForbiddenException({
        code: 'CSRF_REJECTED',
        message: 'حدّث الصفحة وحاول تاني',
      });
    }
  }
}
