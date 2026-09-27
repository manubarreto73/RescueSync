import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Organizacion, TipoOrganizacion } from '@prisma/client';

export class OrganizacionResponseDto {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: 'Cruz Solidaria' })
  nombre!: string;

  @ApiProperty({ enum: TipoOrganizacion })
  tipo!: TipoOrganizacion;

  @ApiPropertyOptional({ nullable: true })
  cuit!: string | null;

  @ApiPropertyOptional({ nullable: true })
  codigoNacional!: string | null;

  @ApiPropertyOptional({ nullable: true })
  emailContacto!: string | null;

  @ApiPropertyOptional({ nullable: true })
  telefonoContacto!: string | null;

  @ApiPropertyOptional({ nullable: true })
  localidad!: string | null;

  @ApiPropertyOptional({ nullable: true })
  provincia!: string | null;

  @ApiProperty()
  activo!: boolean;

  @ApiProperty()
  fechaCreacion!: Date;

  static from(organizacion: Organizacion): OrganizacionResponseDto {
    const dto = new OrganizacionResponseDto();
    dto.id = organizacion.id;
    dto.nombre = organizacion.nombre;
    dto.tipo = organizacion.tipo;
    dto.cuit = organizacion.cuit;
    dto.codigoNacional = organizacion.codigoNacional;
    dto.emailContacto = organizacion.emailContacto;
    dto.telefonoContacto = organizacion.telefonoContacto;
    dto.localidad = organizacion.localidad;
    dto.provincia = organizacion.provincia;
    dto.activo = organizacion.activo;
    dto.fechaCreacion = organizacion.fechaCreacion;
    return dto;
  }
}
