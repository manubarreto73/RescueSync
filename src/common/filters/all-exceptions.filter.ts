import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { ErrorResponse } from './error-response';

/**
 * Equivalente al @RestControllerAdvice + @ExceptionHandler de Spring.
 *
 * @Catch() sin argumentos atrapa absolutamente todo lo que se propague desde
 * un controller o servicio, y lo traduce a un unico contrato de error.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { status, message } = this.resolve(exception);

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method} ${request.url} -> ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(`${request.method} ${request.url} -> ${status}: ${JSON.stringify(message)}`);
    }

    const body: ErrorResponse = {
      status,
      message,
      path: request.url,
      timestamp: new Date().toISOString(),
    };

    response.status(status).json(body);
  }

  private resolve(exception: unknown): { status: number; message: string | string[] } {
    // 1. Excepciones HTTP de Nest (incluye BusinessException y ResourceNotFoundException,
    //    y los errores que arma el ValidationPipe con class-validator).
    if (exception instanceof HttpException) {
      const payload = exception.getResponse();
      const message =
        typeof payload === 'string'
          ? payload
          : ((payload as { message?: string | string[] }).message ?? exception.message);
      return { status: exception.getStatus(), message };
    }

    // 2. Errores conocidos de Prisma. A diferencia de Hibernate, Prisma no
    //    propaga el SQLSTATE de Postgres: usa sus propios codigos P2xxx.
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      switch (exception.code) {
        case 'P2002': // unique constraint
          return {
            status: HttpStatus.CONFLICT,
            message: `Ya existe un registro con ese ${this.campos(exception)}`,
          };
        case 'P2003': // foreign key constraint
          return {
            status: HttpStatus.CONFLICT,
            message: 'No se puede operar: el registro esta referenciado por otro',
          };
        case 'P2025': // registro requerido no encontrado (update/delete)
          return { status: HttpStatus.NOT_FOUND, message: 'El registro no existe' };
        default:
          this.logger.error(`Prisma ${exception.code}: ${exception.message}`);
          return {
            status: HttpStatus.INTERNAL_SERVER_ERROR,
            message: 'Error al acceder a la base de datos',
          };
      }
    }

    // Un error de validacion de Prisma significa que el codigo armo mal la
    // query: es un bug nuestro, nunca culpa del cliente.
    if (exception instanceof Prisma.PrismaClientValidationError) {
      this.logger.error(`Query mal construida: ${exception.message}`);
      return { status: HttpStatus.INTERNAL_SERVER_ERROR, message: 'Error interno del servidor' };
    }

    if (exception instanceof Prisma.PrismaClientInitializationError) {
      return {
        status: HttpStatus.SERVICE_UNAVAILABLE,
        message: 'Base de datos no disponible',
      };
    }

    // 3. Redis caido u otro servicio de infraestructura no disponible.
    if (exception instanceof Error && exception.name === 'ReplyError') {
      return { status: HttpStatus.SERVICE_UNAVAILABLE, message: 'Servicio no disponible' };
    }

    // 4. Cualquier otra cosa: no se filtra el detalle interno al cliente.
    return { status: HttpStatus.INTERNAL_SERVER_ERROR, message: 'Error interno del servidor' };
  }

  /** Extrae del error P2002 el nombre del campo que violo la restriccion unica. */
  private campos(exception: Prisma.PrismaClientKnownRequestError): string {
    const target = (exception.meta as { target?: string[] | string } | undefined)?.target;
    if (Array.isArray(target)) return target.join(', ');
    return target ?? 'valor';
  }
}
