import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CaracterOferta } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Min,
  ValidateNested,
} from 'class-validator';

/** Resultado de evaluar una linea contra el Sistema Nacional. */
export class ResultadoLineaDto {
  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  lineaId!: number;

  @ApiProperty({ enum: CaracterOferta, example: CaracterOferta.PRINCIPAL })
  @IsEnum(CaracterOferta)
  caracter!: CaracterOferta;

  @ApiPropertyOptional({ example: 'Habilitacion nivel 2 - rescate acuatico' })
  @IsString()
  @Length(3, 200)
  @IsOptional()
  perfilCompetencia?: string;
}

/**
 * Lo que Bonita devuelve tras consultar al Sistema Nacional.
 *
 * No hay un campo "aprobada" a proposito: la consigna dice que el Sistema
 * Nacional no aplica un rechazo punitivo o binario, sino que retorna perfiles
 * de competencia. Una ONG con menor habilitacion no queda afuera, entra como
 * apoyo secundario.
 */
export class ValidarOfertasDto {
  @ApiProperty({ type: [ResultadoLineaDto] })
  @IsArray()
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => ResultadoLineaDto)
  resultados!: ResultadoLineaDto[];
}
