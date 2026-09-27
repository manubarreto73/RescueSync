import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NivelGravedad, TipoDesastre } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsDate, IsEnum, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { NoFutura } from '../../../../common/validators/no-futura.validator';

/**
 * Alta de emergencia por parte del municipio.
 *
 * No incluye municipioId: se toma de la organizacion del usuario del token.
 * Si viniera en el body, un operador podria registrar emergencias a nombre de
 * otro municipio.
 */
export class RegisterEmergenciaDto {
  @ApiProperty({ enum: TipoDesastre, example: TipoDesastre.INUNDACION })
  @IsEnum(TipoDesastre, { message: 'El tipo de desastre no es valido' })
  tipo!: TipoDesastre;

  @ApiProperty({ enum: NivelGravedad, example: NivelGravedad.ALTA })
  @IsEnum(NivelGravedad, { message: 'El nivel de gravedad no es valido' })
  gravedad!: NivelGravedad;

  @ApiProperty({ example: 'Barrio Costanera y adyacencias, margen sur del rio' })
  @IsString()
  @Length(5, 200)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  zonaAfectada!: string;

  @ApiProperty({ example: 'Crecida del rio tras 48 horas de lluvias. Viviendas anegadas.' })
  @IsString()
  @Length(20, 2000, { message: 'La descripcion debe tener entre 20 y 2000 caracteres' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  descripcion!: string;

  @ApiPropertyOptional({ example: 350 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10_000_000)
  @IsOptional()
  personasAfectadas?: number;

  @ApiProperty({ example: '2026-09-22T14:30:00.000Z', description: 'Cuando ocurrio el desastre' })
  @Type(() => Date)
  @IsDate({ message: 'La fecha de ocurrencia no es una fecha valida' })
  @NoFutura({ message: 'La fecha de ocurrencia no puede estar en el futuro' })
  fechaOcurrencia!: Date;
}
