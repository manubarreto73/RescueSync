import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  CaracterOferta,
  EstadoOferta,
  Lote,
  Oferta,
  OfertaLinea,
  OfertaParticipante,
  Organizacion,
} from '@prisma/client';

export type OfertaConRelaciones = Oferta & {
  organizacionLider: Pick<Organizacion, 'id' | 'nombre'>;
  participantes: (OfertaParticipante & {
    organizacion: Pick<Organizacion, 'id' | 'nombre' | 'codigoNacional'>;
  })[];
  lineas: (OfertaLinea & {
    lote: Pick<Lote, 'id' | 'descripcion' | 'unidad' | 'cantidadRequerida'>;
    organizacion: Pick<Organizacion, 'id' | 'nombre'>;
  })[];
};

class ParticipanteDto {
  @ApiProperty() organizacionId!: number;
  @ApiProperty() organizacionNombre!: string;
  @ApiPropertyOptional({ nullable: true }) codigoNacional!: string | null;
  @ApiProperty() esLider!: boolean;
  @ApiProperty() finalizado!: boolean;
  @ApiPropertyOptional({ nullable: true }) fechaFinalizacion!: Date | null;
}

class LineaDto {
  @ApiProperty() id!: number;
  @ApiProperty() loteId!: number;
  @ApiProperty() loteDescripcion!: string;
  @ApiProperty() cantidad!: number;
  @ApiProperty() cantidadRequeridaDelLote!: number;
  @ApiProperty() unidad!: string;
  @ApiProperty() organizacionId!: number;
  @ApiProperty() organizacionNombre!: string;
  @ApiProperty({ enum: CaracterOferta }) caracter!: CaracterOferta;
  @ApiPropertyOptional({ nullable: true }) perfilCompetencia!: string | null;
}

export class OfertaResponseDto {
  @ApiProperty() id!: number;
  @ApiProperty() emergenciaId!: number;
  @ApiProperty({ enum: EstadoOferta }) estado!: EstadoOferta;
  @ApiProperty({ description: 'Se incrementa con cada edicion dentro de la ventana' })
  version!: number;

  @ApiProperty() organizacionLiderId!: number;
  @ApiProperty() organizacionLiderNombre!: string;

  /**
   * Un consorcio es, por definicion, una oferta con mas de un participante.
   * Se expone calculado para que el tablero de indicadores pueda contar el
   * "porcentaje de resolucion mediante consorcios" sin recorrer relaciones.
   */
  @ApiProperty({ description: 'true si participa mas de una organizacion' })
  esConsorcio!: boolean;

  @ApiProperty({ type: [ParticipanteDto] })
  participantes!: ParticipanteDto[];

  @ApiProperty({ type: [LineaDto] })
  lineas!: LineaDto[];

  @ApiPropertyOptional({ nullable: true }) observaciones!: string | null;
  @ApiPropertyOptional({ nullable: true }) fechaPresentacion!: Date | null;
  @ApiPropertyOptional({ nullable: true }) fechaAdjudicacion!: Date | null;
  @ApiPropertyOptional({ nullable: true }) motivoNoAdjudicacion!: string | null;
  @ApiProperty() fechaCreacion!: Date;

  static from(oferta: OfertaConRelaciones): OfertaResponseDto {
    const dto = new OfertaResponseDto();
    dto.id = oferta.id;
    dto.emergenciaId = oferta.emergenciaId;
    dto.estado = oferta.estado;
    dto.version = oferta.version;
    dto.organizacionLiderId = oferta.organizacionLiderId;
    dto.organizacionLiderNombre = oferta.organizacionLider.nombre;
    dto.esConsorcio = oferta.participantes.length > 1;

    dto.participantes = oferta.participantes.map((p) => ({
      organizacionId: p.organizacionId,
      organizacionNombre: p.organizacion.nombre,
      codigoNacional: p.organizacion.codigoNacional,
      esLider: p.esLider,
      finalizado: p.finalizado,
      fechaFinalizacion: p.fechaFinalizacion,
    }));

    dto.lineas = oferta.lineas.map((l) => ({
      id: l.id,
      loteId: l.loteId,
      loteDescripcion: l.lote.descripcion,
      cantidad: l.cantidad,
      cantidadRequeridaDelLote: l.lote.cantidadRequerida,
      unidad: l.lote.unidad,
      organizacionId: l.organizacionId,
      organizacionNombre: l.organizacion.nombre,
      caracter: l.caracter,
      perfilCompetencia: l.perfilCompetencia,
    }));

    dto.observaciones = oferta.observaciones;
    dto.fechaPresentacion = oferta.fechaPresentacion;
    dto.fechaAdjudicacion = oferta.fechaAdjudicacion;
    dto.motivoNoAdjudicacion = oferta.motivoNoAdjudicacion;
    dto.fechaCreacion = oferta.fechaCreacion;
    return dto;
  }
}
