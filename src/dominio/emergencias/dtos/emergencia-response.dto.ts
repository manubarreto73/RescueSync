import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Emergencia,
  EstadoEmergencia,
  NivelGravedad,
  Organizacion,
  TipoDesastre,
  Usuario,
} from '@prisma/client';

/**
 * Emergencia tal como sale por HTTP.
 *
 * El tipo `EmergenciaConRelaciones` es Prisma en estado puro: el modelo base
 * mas exactamente las relaciones que se pidieron con include. Si el servicio
 * se olvida el include, esto no compila — a diferencia de TypeORM, donde la
 * propiedad esta siempre tipada como presente y explota en runtime.
 */
export type EmergenciaConRelaciones = Emergencia & {
  municipio: Pick<Organizacion, 'id' | 'nombre'>;
  registradaPor: Pick<Usuario, 'id' | 'nombreCompleto'>;
};

export class EmergenciaResponseDto {
  @ApiProperty()
  id!: number;

  @ApiProperty({ enum: TipoDesastre })
  tipo!: TipoDesastre;

  @ApiProperty({ enum: NivelGravedad })
  gravedad!: NivelGravedad;

  @ApiProperty()
  zonaAfectada!: string;

  @ApiProperty()
  descripcion!: string;

  @ApiPropertyOptional({ nullable: true })
  personasAfectadas!: number | null;

  @ApiProperty()
  fechaOcurrencia!: Date;

  @ApiProperty({ enum: EstadoEmergencia })
  estado!: EstadoEmergencia;

  @ApiPropertyOptional({ nullable: true })
  fechaCierreConvocatoria!: Date | null;

  @ApiPropertyOptional({ nullable: true })
  motivoCancelacion!: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'Instancia del proceso en Bonita' })
  bonitaCaseId!: string | null;

  @ApiProperty()
  municipioId!: number;

  @ApiProperty({ example: 'Municipalidad de Villa Carlos Paz' })
  municipioNombre!: string;

  @ApiProperty()
  registradaPorId!: number;

  @ApiProperty({ example: 'Laura Fernandez' })
  registradaPorNombre!: string;

  @ApiProperty()
  fechaCreacion!: Date;

  static from(emergencia: EmergenciaConRelaciones): EmergenciaResponseDto {
    const dto = new EmergenciaResponseDto();
    dto.id = emergencia.id;
    dto.tipo = emergencia.tipo;
    dto.gravedad = emergencia.gravedad;
    dto.zonaAfectada = emergencia.zonaAfectada;
    dto.descripcion = emergencia.descripcion;
    dto.personasAfectadas = emergencia.personasAfectadas;
    dto.fechaOcurrencia = emergencia.fechaOcurrencia;
    dto.estado = emergencia.estado;
    dto.fechaCierreConvocatoria = emergencia.fechaCierreConvocatoria;
    dto.motivoCancelacion = emergencia.motivoCancelacion;
    dto.bonitaCaseId = emergencia.bonitaCaseId;
    dto.municipioId = emergencia.municipioId;
    dto.municipioNombre = emergencia.municipio.nombre;
    dto.registradaPorId = emergencia.registradaPorId;
    dto.registradaPorNombre = emergencia.registradaPor.nombreCompleto;
    dto.fechaCreacion = emergencia.fechaCreacion;
    return dto;
  }
}
