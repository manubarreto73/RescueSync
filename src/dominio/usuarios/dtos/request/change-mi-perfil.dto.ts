import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, Length } from 'class-validator';

/**
 * Edicion que un usuario puede hacer sobre SI MISMO.
 *
 * Es un DTO aparte de ChangeUsuarioDto, y esa separacion es el control de
 * seguridad: lo que no esta declarado aca, no se puede cambiar. Con
 * forbidNonWhitelisted activado, mandar un campo de mas no lo ignora, lo
 * rechaza con 400.
 *
 * Que NO esta y por que:
 *
 *   rol    Es la definicion misma del RBAC. Si un usuario pudiera editarlo,
 *          cualquiera se haria CENTRO_COORDINADOR y el control de accesos
 *          dejaria de existir. Es escalacion de privilegios de manual.
 *
 *   activo La baja tiene su propio endpoint, con su propia logica (revocar
 *          las sesiones abiertas). No es un campo que se toca de costado.
 *
 *   email  Es la credencial con la que se entra al sistema. Cambiarla sin
 *          verificar que la casilla nueva existe, y sin pedir la contrasena
 *          actual, es el camino clasico para consolidar el robo de una
 *          cuenta. Merece un flujo propio, no este.
 */
export class ChangeMiPerfilDto {
  @ApiProperty({ example: 'Maria Gomez' })
  @IsString()
  @Length(3, 150)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  nombreCompleto!: string;

  @ApiPropertyOptional({ example: '+54 9 351 555-1234', nullable: true })
  @IsString()
  @Length(6, 30)
  @IsOptional()
  telefono?: string | null;
}
