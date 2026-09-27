import { ApiPropertyOptional } from '@nestjs/swagger';
import { EstadoOferta } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Min } from 'class-validator';
import { PaginationQueryDto } from '../../../../common/dtos/pagination-query.dto';

export class FindOfertasQuery extends PaginationQueryDto {
  @ApiPropertyOptional({ example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  emergenciaId?: number;

  @ApiPropertyOptional({ enum: EstadoOferta })
  @IsEnum(EstadoOferta)
  @IsOptional()
  estado?: EstadoOferta;
}
