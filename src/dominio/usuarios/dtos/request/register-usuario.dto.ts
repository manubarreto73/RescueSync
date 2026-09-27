import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Min,
} from 'class-validator';
import { Rol } from '../../../../common/enums/rol.enum';

/**
 * Alta de usuario. Equivale a RegisterUsuarioRequest.
 *
 * No tiene metodo toEntity(): con Prisma no hay entidades que construir, el
 * servicio le pasa los campos al repositorio y este arma el objeto `data`.
 */
export class RegisterUsuarioDto {
  @ApiProperty({ example: 'coordinador@rescuesync.ar' })
  @IsEmail({}, { message: 'El email no tiene un formato valido' })
  @Length(5, 120)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email!: string;

  @ApiProperty({ example: 'Rescue2026!', minLength: 8 })
  @IsString()
  @Length(8, 72, { message: 'La contrasena debe tener entre 8 y 72 caracteres' })
  @Matches(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message: 'La contrasena debe incluir mayuscula, minuscula y numero',
  })
  password!: string;

  @ApiProperty({ example: 'Maria Gomez' })
  @IsString()
  @Length(3, 150)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  nombreCompleto!: string;

  @ApiPropertyOptional({ example: '+54 9 351 555-1234' })
  @IsString()
  @Length(6, 30)
  @IsOptional()
  telefono?: string;

  @ApiProperty({ enum: Rol, example: Rol.REPRESENTANTE_ONG })
  @IsEnum(Rol, { message: 'El rol no es uno de los perfiles validos' })
  rol!: Rol;

  /**
   * Obligatoria para OPERADOR_MUNICIPAL y REPRESENTANTE_ONG, opcional para
   * CENTRO_COORDINADOR y AUDITOR. La regla no se puede expresar con
   * decoradores porque depende del valor de otro campo: vive en el servicio.
   */
  @ApiPropertyOptional({ example: 1, description: 'Organizacion a la que pertenece' })
  @IsInt()
  @Min(1)
  @IsOptional()
  organizacionId?: number;
}
