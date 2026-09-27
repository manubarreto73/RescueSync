import { ApiPropertyOptional } from '@nestjs/swagger';
import { TipoOrganizacion } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../../../common/dtos/pagination-query.dto';

export class FindOrganizacionesQuery extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: TipoOrganizacion })
  @IsEnum(TipoOrganizacion)
  @IsOptional()
  tipo?: TipoOrganizacion;
}
