import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { HealthCheck, HealthCheckService, PrismaHealthIndicator } from '@nestjs/terminus';
import { Public } from '../common/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

/**
 * Equivalente a Spring Boot Actuator /actuator/health.
 * Lo usa el healthcheck de Docker y sirve para verificar la integracion
 * con Bonita sin tener que autenticarse.
 */
@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prismaIndicator: PrismaHealthIndicator,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Public()
  @Get()
  @HealthCheck()
  @ApiOperation({ summary: 'Estado de la API y sus dependencias' })
  check() {
    return this.health.check([
      () => this.prismaIndicator.pingCheck('postgres', this.prisma),
      async () => {
        const key = 'health:ping';
        await this.redis.set(key, 'pong', 10);
        const ok = (await this.redis.get(key)) === 'pong';
        return { redis: { status: ok ? 'up' : 'down' } };
      },
    ]);
  }
}
