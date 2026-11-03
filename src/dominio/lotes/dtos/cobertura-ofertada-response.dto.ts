import { ApiProperty } from '@nestjs/swagger';
import { CategoriaRecurso, EstadoEmergencia } from '@prisma/client';

export class LoteOfertadoDto {
  @ApiProperty()
  loteId!: number;

  @ApiProperty({ enum: CategoriaRecurso })
  categoria!: CategoriaRecurso;

  @ApiProperty()
  descripcion!: string;

  @ApiProperty({ example: 'personas' })
  unidad!: string;

  @ApiProperty({ example: 5 })
  cantidadRequerida!: number;

  @ApiProperty({ example: 3 })
  cantidadOfertada!: number;

  @ApiProperty({ example: 2, description: 'Lo que falta ofertar. Nunca es negativo.' })
  faltante!: number;

  @ApiProperty()
  cubierto!: boolean;
}

/**
 * Lo que la red ofreció frente a lo que se pidió. Lo lee el gateway de Bonita al
 * vencer el temporizador y el Coordinador para decidir cómo seguir.
 *
 * Va en un endpoint propio y no en LoteResponseDto porque esa respuesta también
 * la reciben las ONGs: durante la ventana no pueden saber cuánto ofertaron las
 * demás.
 */
export class CoberturaOfertadaResponseDto {
  @ApiProperty()
  emergenciaId!: number;

  @ApiProperty({ enum: EstadoEmergencia })
  estadoEmergencia!: EstadoEmergencia;

  @ApiProperty({ description: 'true si lo ofertado alcanza para todos los lotes' })
  cubierta!: boolean;

  @ApiProperty({ example: 2 })
  totalLotes!: number;

  @ApiProperty({ example: 1 })
  lotesCubiertos!: number;

  @ApiProperty({ type: [LoteOfertadoDto] })
  lotes!: LoteOfertadoDto[];
}
