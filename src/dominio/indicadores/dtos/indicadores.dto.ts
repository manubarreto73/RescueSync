import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CategoriaRecurso, EstadoEmergencia } from '@prisma/client';
import { IsOptional, Matches } from 'class-validator';

export class IndicadoresQuery {
  @ApiPropertyOptional({ example: '2026-11', description: 'Mes a consultar. Por defecto, el actual' })
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'mes debe tener el formato AAAA-MM' })
  @IsOptional()
  mes?: string;
}

export class SuministroDto {
  @ApiProperty({ enum: CategoriaRecurso }) categoria!: CategoriaRecurso;
  @ApiProperty() unidad!: string;
  @ApiProperty() cantidad!: number;
}

export class ConsorciosDto {
  @ApiProperty() ofertasAdjudicadas!: number;
  @ApiProperty() enConsorcio!: number;
  @ApiProperty() porcentaje!: number;
}

export class ProyectoPorEstadoDto {
  @ApiProperty({ enum: EstadoEmergencia }) estado!: EstadoEmergencia;
  @ApiProperty() cantidad!: number;
}

export class ProyectosDto {
  @ApiProperty() total!: number;
  @ApiProperty() finalizados!: number;
  @ApiProperty({ type: [ProyectoPorEstadoDto] }) porEstado!: ProyectoPorEstadoDto[];
}

export class TiempoEtapaDto {
  @ApiProperty() etapa!: string;
  @ApiProperty() casos!: number;
  @ApiProperty() promedioHoras!: number;
}

export class TiemposPorEtapaDto {
  @ApiProperty({ description: 'false si Bonita esta apagado o no responde' })
  disponible!: boolean;

  @ApiProperty({ type: [TiempoEtapaDto] }) etapas!: TiempoEtapaDto[];
}

export class IndicadoresResponseDto {
  @ApiProperty({ example: '2026-11' }) mes!: string;
  @ApiProperty({ type: [SuministroDto] }) suministrosMovilizados!: SuministroDto[];
  @ApiProperty({ type: ConsorciosDto }) consorcios!: ConsorciosDto;
  @ApiProperty({ type: ProyectosDto }) proyectos!: ProyectosDto;
  @ApiProperty({ type: TiemposPorEtapaDto }) tiemposPorEtapa!: TiemposPorEtapaDto;
}
