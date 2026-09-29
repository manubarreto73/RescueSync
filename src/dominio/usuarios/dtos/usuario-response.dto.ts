import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Usuario } from '@prisma/client';
import { Rol } from '../../../common/enums/rol.enum';

/**
 * Representacion saliente del usuario.
 *
 * Existe por una razon concreta: el modelo de Prisma incluye `password`, y si
 * devolvieramos el modelo crudo estariamos filtrando el hash en cada respuesta.
 * La factory `from()` es la unica puerta de salida.
 */
export class UsuarioResponseDto {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: 'coordinador@rescuesync.ar' })
  email!: string;

  @ApiProperty({ example: 'Maria Gomez' })
  nombreCompleto!: string;

  @ApiPropertyOptional({ example: '+54 9 351 555-1234', nullable: true })
  telefono!: string | null;

  @ApiProperty({ enum: Rol })
  rol!: Rol;

  @ApiPropertyOptional({ type: Number, example: 1, nullable: true })
  organizacionId!: number | null;

  @ApiProperty()
  activo!: boolean;

  @ApiProperty()
  fechaCreacion!: Date;

  @ApiPropertyOptional({ nullable: true })
  ultimoAcceso!: Date | null;

  static from(usuario: Usuario): UsuarioResponseDto {
    const dto = new UsuarioResponseDto();
    dto.id = usuario.id;
    dto.email = usuario.email;
    dto.nombreCompleto = usuario.nombreCompleto;
    dto.telefono = usuario.telefono;
    dto.rol = usuario.rol as Rol;
    dto.organizacionId = usuario.organizacionId;
    dto.activo = usuario.activo;
    dto.fechaCreacion = usuario.fechaCreacion;
    dto.ultimoAcceso = usuario.ultimoAcceso;
    return dto;
  }
}
