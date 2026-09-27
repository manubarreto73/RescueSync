import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

/** Lo que una organizacion concreta aporta para un lote concreto. */
export class LineaOfertaDto {
  @ApiProperty({ example: 1, description: 'Lote que se busca cubrir' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  loteId!: number;

  /**
   * Cual de los participantes aporta esto.
   *
   * En una oferta individual es siempre la propia organizacion. En un
   * consorcio es lo que permite saber quien puso que, y es imprescindible
   * porque el compromiso de recursos ante el Sistema Nacional se registra
   * por ONG, no por oferta.
   */
  @ApiProperty({ example: 2, description: 'Organizacion que aporta' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  organizacionId!: number;

  @ApiProperty({ example: 3, description: 'Puede ser menor a lo pedido: oferta parcial' })
  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'Una linea de oferta tiene que aportar al menos 1 unidad' })
  @Max(1_000_000)
  cantidad!: number;
}

export class RegisterOfertaDto {
  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  emergenciaId!: number;

  /**
   * Las otras organizaciones que se suman al consorcio. La propia se agrega
   * sola como lider: se toma del token, no del body.
   */
  @ApiPropertyOptional({ type: [Number], example: [3], description: 'Consorcio: otras ONGs' })
  @IsArray()
  @ArrayMaxSize(10)
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @IsOptional()
  organizacionesAsociadas?: number[];

  @ApiProperty({ type: [LineaOfertaDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'La oferta tiene que tener al menos una linea' })
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => LineaOfertaDto)
  lineas!: LineaOfertaDto[];

  @ApiPropertyOptional({ example: 'Disponibilidad inmediata, traslado por cuenta propia' })
  @IsString()
  @Length(3, 1000)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  observaciones?: string;
}
