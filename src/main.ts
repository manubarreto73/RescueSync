import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { configurarApp } from './config/app-setup';

/**
 * Punto de entrada. Equivale a SpringApplication.run(...).
 *
 * La configuracion de la app (pipes, filtros, CORS, versionado) vive en
 * configurarApp() para que los tests e2e levanten exactamente la misma app.
 */
async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  const port = config.get<number>('app.port', 3000);
  const prefix = config.get<string>('app.apiPrefix', 'api');

  configurarApp(app, config);

  if (config.get<boolean>('app.swaggerEnabled')) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('RescueSync API')
      .setDescription('Backend de la aplicacion web de RescueSync - Sistemas Distribuidos 2026')
      .setVersion('1.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup(`${prefix}/docs`, app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
  }

  await app.listen(port, '0.0.0.0');
  logger.log(`API escuchando en http://localhost:${port}/${prefix}`);
  logger.log(`Swagger en http://localhost:${port}/${prefix}/docs`);
}

void bootstrap();
