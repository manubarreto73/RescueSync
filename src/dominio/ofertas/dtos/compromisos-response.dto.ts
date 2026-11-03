import { ApiProperty } from '@nestjs/swagger';
import { CategoriaRecurso, NivelGravedad } from '@prisma/client';

export class ItemCompromisoDto {
  @ApiProperty({ enum: CategoriaRecurso })
  categoria!: CategoriaRecurso;

  @ApiProperty({ example: 5 })
  cantidad!: number;
}

export class CompromisoOngDto {
  @ApiProperty({ example: 'ONG-0001' })
  codigoNacional!: string;

  @ApiProperty({ type: [ItemCompromisoDto] })
  items!: ItemCompromisoDto[];
}

/**
 * Tiene exactamente la forma que pide POST /proyectos/:ref/compromisos del
 * Sistema Nacional, para que Bonita la reenvíe sin transformarla.
 */
export class CompromisosResponseDto {
  @ApiProperty({ enum: NivelGravedad })
  gravedad!: NivelGravedad;

  @ApiProperty({ type: [CompromisoOngDto] })
  compromisos!: CompromisoOngDto[];
}
