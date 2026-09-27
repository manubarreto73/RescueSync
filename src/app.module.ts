import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerConfigModule } from './common/throttler/throttler-config.module';
import configuration from './config/configuration';
import { validateEnv } from './config/env.validation';
import { AuthModule } from './dominio/auth/auth.module';
import { EmergenciasModule } from './dominio/emergencias/emergencias.module';
import { LotesModule } from './dominio/lotes/lotes.module';
import { OfertasModule } from './dominio/ofertas/ofertas.module';
import { OrganizacionesModule } from './dominio/organizaciones/organizaciones.module';
import { UsuariosModule } from './dominio/usuarios/usuarios.module';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { SecurityModule } from './security/security.module';

/**
 * Modulo raiz. Equivalente a la clase anotada con @SpringBootApplication:
 * es el punto donde se ensambla todo el grafo de dependencias.
 *
 * Los modulos de dominio (usuarios, emergencias, lotes, ofertas...) se van a
 * ir agregando en el array de imports a medida que se implementen.
 */
@Module({
  imports: [
    // Carga .env, lo valida y deja ConfigService disponible en toda la app.
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate: validateEnv,
      envFilePath: ['.env'],
      cache: true,
    }),

    PrismaModule,
    RedisModule,

    // Antes que SecurityModule a proposito: los guards globales se ejecutan
    // en el orden en que se registran, y conviene descartar por 429 antes de
    // gastar CPU verificando la firma de un JWT.
    ThrottlerConfigModule,

    SecurityModule,
    HealthModule,

    // --- Modulos de dominio ---
    OrganizacionesModule,
    UsuariosModule,
    AuthModule,
    EmergenciasModule,
    LotesModule,
    OfertasModule,
  ],
})
export class AppModule {}
