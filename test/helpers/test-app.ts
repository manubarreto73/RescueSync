import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { configurarApp } from '../../src/config/app-setup';
import { PrismaService } from '../../src/prisma/prisma.service';
import { RedisService } from '../../src/redis/redis.service';

export interface TestContext {
  app: INestApplication;
  prisma: PrismaService;
  redis: RedisService;
}

export interface OpcionesTestApp {
  /**
   * Si el rate limiting esta activo. Por defecto NO lo esta.
   *
   * Motivo: el limite del login es de 3 intentos cada 10 segundos, y una suite
   * que prueba credenciales invalidas, roles y validaciones hace muchos mas.
   * Sin desactivarlo, los tests empezarian a fallar con 429 por orden de
   * ejecucion, que es la peor clase de test: el que falla por motivos que no
   * tienen que ver con lo que esta probando (un test "flaky").
   *
   * El comportamiento del throttler se prueba aparte, en throttler.e2e-spec.ts,
   * que si lo deja activo.
   */
  throttling?: boolean;
}

/**
 * Levanta la aplicacion completa en memoria para los tests e2e.
 *
 * Es el equivalente a @SpringBootTest(webEnvironment = RANDOM_PORT): se arma
 * el contenedor de DI de verdad, con la base de verdad y Redis de verdad.
 * Lo unico que no pasa es abrir un puerto TCP: supertest le habla al servidor
 * HTTP en memoria, que es mas rapido y evita conflictos de puertos.
 *
 * `Test.createTestingModule` es el equivalente a @SpringBootTest + @MockBean:
 * arma el modulo y permite reemplazar piezas con overrideProvider /
 * overrideGuard antes de compilar.
 */
export async function crearAppDeTest(opciones: OpcionesTestApp = {}): Promise<TestContext> {
  const { throttling = false } = opciones;

  /**
   * Se apaga por variable de entorno y no con overrideGuard(ThrottlerGuard).
   *
   * Vale la pena saber por que: overrideGuard reemplaza al guard cuando se
   * inyecta por su clase, pero ThrottlerGuard esta registrado como
   * { provide: APP_GUARD, useClass: ThrottlerGuard }, y Nest lo resuelve por
   * el token APP_GUARD. El override compila sin error y no surte ningun
   * efecto: el guard sigue corriendo. Es una trampa silenciosa.
   *
   * ConfigModule lee process.env cuando se construye el modulo, asi que
   * alcanza con setearlo antes de compilar.
   */
  process.env.THROTTLE_ENABLED = throttling ? 'true' : 'false';

  const moduleRef: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication();

  // La misma configuracion que usa main.ts: si esto no estuviera, los tests
  // probarian una app distinta de la que se despliega.
  configurarApp(app, app.get(ConfigService));

  await app.init();

  return {
    app,
    prisma: app.get(PrismaService),
    redis: app.get(RedisService),
  };
}

/** Cierra la app y sus conexiones. Va siempre en afterAll. */
export async function cerrarApp(ctx: TestContext): Promise<void> {
  await ctx.app.close();
}
