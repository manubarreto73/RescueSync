import { HttpException, HttpStatus } from '@nestjs/common';

/** Entidad inexistente. Equivalente a ResourceNotFoundException de Spring. */
export class ResourceNotFoundException extends HttpException {
  constructor(message: string) {
    super(message, HttpStatus.NOT_FOUND);
  }
}
