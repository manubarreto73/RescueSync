import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Violacion de una regla de negocio (duplicados, estados invalidos,
 * validaciones cruzadas). Equivalente a BusinessException de Spring.
 *
 * En Nest conviene extender HttpException en vez de Error a secas: asi el
 * framework ya sabe que status devolver aunque el filtro global no la trate.
 */
export class BusinessException extends HttpException {
  constructor(message: string) {
    super(message, HttpStatus.BAD_REQUEST);
  }
}
