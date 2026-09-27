import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';
import { RedisService } from './redis.service';

/**
 * @Global evita tener que importar RedisModule en cada modulo de dominio:
 * RedisService queda disponible para inyectar en toda la app, igual que un
 * bean singleton de Spring.
 */
@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const logger = new Logger('RedisClient');
        const client = new Redis({
          host: config.get<string>('redis.host'),
          port: config.get<number>('redis.port'),
          password: config.get<string>('redis.password'),
          db: config.get<number>('redis.db', 0),
          maxRetriesPerRequest: 3,
        });

        client.on('connect', () => logger.log('Conectado a Redis'));
        client.on('error', (err) => logger.error(`Error de Redis: ${err.message}`));

        return client;
      },
    },
    RedisService,
  ],
  exports: [RedisService, REDIS_CLIENT],
})
export class RedisModule {}
