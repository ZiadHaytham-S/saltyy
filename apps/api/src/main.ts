import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Request, Response, NextFunction } from 'express';
import { ApiErrorFilter } from './common/api-error.filter.js';
import { AppModule } from './app.module.js';
import { environment } from './config/env.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });
  app.use((_request: Request, response: Response, next: NextFunction) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  });
  app.useBodyParser('json', {
    limit: '256kb',
    type: (request) =>
      request.method === 'PATCH' &&
      /^\/merchant\/design\/?$/.test(request.url?.split('?')[0] ?? ''),
  });
  app.useBodyParser('json', { limit: '16kb' });
  app.useGlobalFilters(new ApiErrorFilter());
  app.getHttpAdapter().getInstance().set('trust proxy', false);
  app.enableShutdownHooks();
  app.getHttpAdapter().getInstance().disable('x-powered-by');
  await app.listen(environment.API_PORT, environment.API_HOST);
  Logger.log(
    'Sallty API listening on port ' + environment.API_PORT,
    'Bootstrap',
  );
}
bootstrap().catch(() => {
  Logger.error(
    'API startup failed. Check configuration and port availability.',
    'Bootstrap',
  );
  process.exitCode = 1;
});
