import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';

export class CancelarEmergenciaDto {
  @ApiProperty({ example: 'La crecida cedio y el municipio resolvio con recursos propios' })
  @IsString()
  @Length(10, 500, { message: 'El motivo debe tener entre 10 y 500 caracteres' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  motivo!: string;
}
