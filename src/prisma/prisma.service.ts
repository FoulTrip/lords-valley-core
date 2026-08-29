import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  
  constructor() {
    super({
      log: ['warn', 'error'],
    });
  }

  async onModuleInit() {
    // Conexión explícita al arrancar el módulo de NestJS
    await this.$connect();
  }

  async onModuleDestroy() {
    // Cierre limpio de conexiones para evitar fugas de memoria
    await this.$disconnect();
  }
}
