import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../../../common/dtos/pagination-query.dto';
import { Rol } from '../../../../common/enums/rol.enum';

/** Filtros del listado de usuarios: hereda page/size/busqueda. */
export class FindUsuariosQuery extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: Rol, description: 'Filtra por perfil' })
  @IsEnum(Rol)
  @IsOptional()
  rol?: Rol;
}
