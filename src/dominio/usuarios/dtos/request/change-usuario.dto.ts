import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsEnum, IsInt, IsOptional, IsString, Length, Min } from 'class-validator';
import { Rol } from '../../../../common/enums/rol.enum';

/**
 * Edicion de usuario. Lleva TODOS los campos editables, no un subconjunto:
 * el cliente manda el estado completo deseado y el servicio lo aplica.
 *
 * La contrasena NO esta aca a proposito: cambiarla es otra operacion, con
 * otras reglas (hay que conocer la actual) y otro endpoint.
 */
export class ChangeUsuarioDto {
  @ApiProperty({ example: 'coordinador@rescuesync.ar' })
  @IsEmail({}, { message: 'El email no tiene un formato valido' })
  @Length(5, 120)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email!: string;

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

  @ApiProperty({ enum: Rol })
  @IsEnum(Rol)
  rol!: Rol;

  @ApiPropertyOptional({ example: 1 })
  @IsInt()
  @Min(1)
  @IsOptional()
  organizacionId?: number;
}
