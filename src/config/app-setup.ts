import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AllExceptionsFilter } from '../common/filters/all-exceptions.filter';

/**
 * Configuracion transversal de la aplicacion: prefijo, versionado, CORS,
 * validacion y manejo de errores.
 *
 * Vive aca y no dentro de main.ts por una razon concreta: los tests e2e
 * levantan la app con su propio bootstrap, y si la configuraran distinto
 * estarian probando un comportamiento que no es el real. Por ejemplo, sin el
 * ValidationPipe un test creeria que la API acepta un email invalido, y sin
 * el AllExceptionsFilter veria 500 donde en produccion hay un 404.
 *
 * Regla: todo lo que cambie como responde la API va aca. Lo que es solo del
 * proceso (escuchar un puerto, imprimir logs de arranque) queda en main.ts.
 */
export function configurarApp(app: INestApplication, config: ConfigService): void {
  const prefix = config.get<string>('app.apiPrefix', 'api');

  // Necesario para que req.ip sea la IP real del cliente y no la del proxy.
  // Sin esto, detras de nginx o de un PaaS el rate limiting por IP contaria
  // todo el trafico como si viniera de un unico origen.
  (app as NestExpressApplication).set('trust proxy', 1);

  app.setGlobalPrefix(prefix);
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  // Cabeceras de seguridad (CSP, HSTS, X-Frame-Options...).
  app.use(helmet());

  // CORS: necesario para que el front y Bonita puedan llamar a esta API.
  app.enableCors({
    origin: config.get<string[]>('cors.allowedOrigins'),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  /**
   * ValidationPipe global = @Valid automatico en todos los @Body().
   *  - whitelist: descarta propiedades que el DTO no declara.
   *  - forbidNonWhitelisted: ademas, rechaza el request si vienen de mas.
   *  - transform: convierte el JSON plano en una instancia real del DTO.
   */
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Manejador global de errores (el @RestControllerAdvice de Nest).
  app.useGlobalFilters(new AllExceptionsFilter());

  // Cierra conexiones de Postgres y Redis de forma ordenada al recibir SIGTERM
  // (importante en Docker, donde el contenedor recibe esa senal al detenerse).
  app.enableShutdownHooks();
}
