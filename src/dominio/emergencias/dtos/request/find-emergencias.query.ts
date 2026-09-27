import { ApiPropertyOptional } from '@nestjs/swagger';
import { EstadoEmergencia, NivelGravedad, TipoDesastre } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../../../common/dtos/pagination-query.dto';

export class FindEmergenciasQuery extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: EstadoEmergencia })
  @IsEnum(EstadoEmergencia)
  @IsOptional()
  estado?: EstadoEmergencia;

  @ApiPropertyOptional({ enum: NivelGravedad })
  @IsEnum(NivelGravedad)
  @IsOptional()
  gravedad?: NivelGravedad;

  @ApiPropertyOptional({ enum: TipoDesastre })
  @IsEnum(TipoDesastre)
  @IsOptional()
  tipo?: TipoDesastre;
}
