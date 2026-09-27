import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';

export class RechazarOfertaDto {
  @ApiProperty({ example: 'Los lotes que cubria ya fueron adjudicados a otra propuesta' })
  @IsString()
  @Length(10, 500)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  motivo!: string;
}
