import { OmitType } from '@nestjs/swagger';
import { RegisterOrganizacionDto } from './register-organizacion.dto';

/**
 * Edicion administrativa de una organizacion.
 *
 * OmitType arma un DTO nuevo a partir de otro sacandole campos, y conserva
 * todos los decoradores de validacion. Es el equivalente a un Pick/Omit de
 * TypeScript, pero que ademas funciona en runtime, que es lo que necesitan
 * class-validator y Swagger.
 *
 * Se omite `tipo` a proposito: cambiarle el tipo a una organizacion que ya
 * tiene usuarios dejaria a un REPRESENTANTE_ONG colgando de un MUNICIPIO, y
 * romperia la regla de coherencia entre rol y organizacion. Si de verdad hace
 * falta, es una baja y un alta, no una edicion.
 */
export class ChangeOrganizacionDto extends OmitType(RegisterOrganizacionDto, ['tipo'] as const) {}
