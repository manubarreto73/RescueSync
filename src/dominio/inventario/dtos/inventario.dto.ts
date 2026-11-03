import { ApiProperty } from '@nestjs/swagger';
import { CategoriaRecurso } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsString,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class RecursoInputDto {
  @ApiProperty({ enum: CategoriaRecurso })
  @IsEnum(CategoriaRecurso)
  categoria!: CategoriaRecurso;

  @ApiProperty({ example: 'personas' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 30)
  unidad!: string;

  @ApiProperty({ example: 20, minimum: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10_000_000)
  cantidadTotal!: number;
}

export class ActualizarInventarioDto {
  @ApiProperty({ type: [RecursoInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(Object.keys(CategoriaRecurso).length)
  @ValidateNested({ each: true })
  @Type(() => RecursoInputDto)
  recursos!: RecursoInputDto[];
}

export class RecursoResponseDto {
  @ApiProperty({ enum: CategoriaRecurso }) categoria!: CategoriaRecurso;
  @ApiProperty() unidad!: string;
  @ApiProperty() cantidadTotal!: number;
  @ApiProperty() cantidadComprometida!: number;
  @ApiProperty() disponible!: number;
}

export class InventarioResponseDto {
  @ApiProperty({ example: 'ONG-0001' }) codigoNacional!: string;
  @ApiProperty({ type: [RecursoResponseDto] }) recursos!: RecursoResponseDto[];
}
