import {
  Controller,
  Get,
  Header,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import { Inject } from '@nestjs/common';
import { IndexReadinessService } from '../database/index-readiness.service.js';

@Controller()
export class HealthController {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @Inject(IndexReadinessService)
    private readonly indexes: IndexReadinessService,
  ) {}

  @Get('health')
  @Header('Cache-Control', 'no-store')
  health() {
    return { status: 'ok', service: 'sallty-api' } as const;
  }

  @Get('ready')
  @Header('Cache-Control', 'no-store')
  async ready() {
    if (
      this.connection.readyState !== 1 ||
      !this.connection.db ||
      !this.indexes.ready
    ) {
      throw new ServiceUnavailableException({
        code: 'DATABASE_NOT_READY',
        message: 'الداتا بيز مش جاهزة مؤقتًا',
        status: 'not_ready',
        database: 'unavailable',
      });
    }
    try {
      await this.connection.db.command({ ping: 1 }, { timeoutMS: 2000 });
      const topology = await this.connection.db.command(
        { hello: 1 },
        { timeoutMS: 2000 },
      );
      if (
        typeof topology.setName !== 'string' ||
        topology.isWritablePrimary !== true
      ) {
        throw new Error('Replica set required');
      }
      return {
        status: 'ready',
        database: 'connected',
        transactions: 'supported',
      } as const;
    } catch {
      throw new ServiceUnavailableException({
        code: 'DATABASE_NOT_READY',
        message: 'الداتا بيز مش جاهزة مؤقتًا',
        status: 'not_ready',
        database: 'unavailable',
      });
    }
  }
}
