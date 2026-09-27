import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule, seconds } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { RedisModule } from '../../redis/redis.module';

/**
 * Rate limiting a nivel HTTP. Equivale a Bucket4j + un filtro en Spring.
 *
 * Se declaran tres ventanas con nombre que se evaluan TODAS a la vez sobre
 * cada request: alcanza con que una se pase para devolver 429. La idea es
 * frenar tanto la rafaga corta (un script disparando en loop) como el abuso
 * sostenido (muchos requests espaciados a lo largo de un minuto).
 *
 * El storage es Redis y no la memoria del proceso: si manana se levantan dos
 * replicas de la API detras de un balanceador, el contador en memoria daria
 * el doble del limite configurado porque cada instancia llevaria el suyo.
 * Con Redis el contador es compartido y el limite es real.
 */
@Module({
  imports: [
    RedisModule,
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule, RedisModule],
      inject: [ConfigService, REDIS_CLIENT],
      useFactory: (config: ConfigService, redis: Redis) => ({
        throttlers: [
          { name: 'short', ttl: seconds(1), limit: 5 },
          { name: 'medium', ttl: seconds(10), limit: 30 },
          { name: 'long', ttl: seconds(60), limit: 120 },
        ],

        // Se reutiliza el mismo cliente de ioredis que ya tiene la app.
        storage: new ThrottlerStorageRedisService(redis),

        skipIf: (context) => {
          // Interruptor general, apagado solo en el entorno de tests.
          if (!config.get<boolean>('throttle.enabled', true)) return true;

          // El healthcheck lo consulta Docker cada 10s: no tiene sentido contarlo.
          const req = context.switchToHttp().getRequest<{ url?: string }>();
          return req.url?.includes('/health') ?? false;
        },

        errorMessage: 'Demasiadas peticiones. Intente nuevamente en unos segundos.',
      }),
    }),
  ],
  providers: [
    // Guard global: se aplica a todos los endpoints sin tener que decorarlos.
    // Se registra ANTES que los guards de seguridad para que un atacante que
    // dispara tokens invalidos tambien coma 429 y no solo 401.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class ThrottlerConfigModule {}
