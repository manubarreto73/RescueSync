import { ApiProperty } from '@nestjs/swagger';
import { CategoriaRecurso, Lote } from '@prisma/client';

export class LoteResponseDto {
  @ApiProperty()
  id!: number;

  @ApiProperty()
  emergenciaId!: number;

  @ApiProperty({ enum: CategoriaRecurso })
  categoria!: CategoriaRecurso;

  @ApiProperty()
  descripcion!: string;

  @ApiProperty({ example: 5 })
  cantidadRequerida!: number;

  @ApiProperty({ example: 'personas' })
  unidad!: string;

  /**
   * Cuanto de lo pedido esta cubierto por ofertas adjudicadas.
   *
   * Se calcula al leer en vez de guardarse en una columna: un contador
   * denormalizado se desincroniza en cuanto alguien retira una oferta o el
   * municipio cambia una adjudicacion, y un numero de cobertura equivocado
   * hace que el Coordinador decida mal.
   */
  @ApiProperty({ example: 3 })
  cantidadCubierta!: number;

  @ApiProperty({ example: 60, description: 'Porcentaje de cobertura' })
  porcentajeCobertura!: number;

  @ApiProperty()
  cubierto!: boolean;

  @ApiProperty()
  fechaCreacion!: Date;

  static from(lote: Lote, cantidadCubierta = 0): LoteResponseDto {
    const dto = new LoteResponseDto();
    dto.id = lote.id;
    dto.emergenciaId = lote.emergenciaId;
    dto.categoria = lote.categoria;
    dto.descripcion = lote.descripcion;
    dto.cantidadRequerida = lote.cantidadRequerida;
    dto.unidad = lote.unidad;
    dto.cantidadCubierta = cantidadCubierta;
    dto.porcentajeCobertura =
      lote.cantidadRequerida > 0
        ? Math.min(100, Math.round((cantidadCubierta / lote.cantidadRequerida) * 100))
        : 0;
    dto.cubierto = cantidadCubierta >= lote.cantidadRequerida;
    dto.fechaCreacion = lote.fechaCreacion;
    return dto;
  }
}
