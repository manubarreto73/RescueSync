import { ApiProperty } from '@nestjs/swagger';
import { CategoriaRecurso } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsEnum, IsInt, IsString, Length, Max, Min } from 'class-validator';

const recortar = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class RegisterLoteDto {
  @ApiProperty({ enum: CategoriaRecurso, example: CategoriaRecurso.PERSONAL })
  @IsEnum(CategoriaRecurso, { message: 'La categoria de recurso no es valida' })
  categoria!: CategoriaRecurso;

  @ApiProperty({ example: 'Paramedicos con experiencia en rescate acuatico' })
  @IsString()
  @Length(5, 200)
  @Transform(recortar)
  descripcion!: string;

  @ApiProperty({ example: 5, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'Un lote tiene que pedir al menos 1 unidad' })
  @Max(1_000_000)
  cantidadRequerida!: number;

  @ApiProperty({ example: 'personas', description: 'personas, raciones, litros, unidades...' })
  @IsString()
  @Length(2, 30)
  @Transform(recortar)
  unidad!: string;
}
