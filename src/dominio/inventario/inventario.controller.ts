import { Body, Controller, ForbiddenException, Get, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Rol } from '../../common/enums/rol.enum';
import { BusinessException } from '../../common/exceptions/business.exception';
import { SistemaNacionalClient } from '../../integracion/sistema-nacional/sistema-nacional.client';
import { AuthenticatedUser } from '../../security/interfaces/jwt-payload.interface';
import { OrganizacionesService } from '../organizaciones/services/organizaciones.service';
import { ActualizarInventarioDto, InventarioResponseDto } from './dtos/inventario.dto';

/**
 * El inventario vive en el Sistema Nacional, que es donde despues se bloquean
 * los recursos al adjudicar. Este controller solo reenvia, con el codigo de la
 * organizacion del usuario: nunca se elige por parametro.
 */
@ApiTags('Inventario')
@ApiBearerAuth('access-token')
@Controller({ path: 'inventario', version: '1' })
export class InventarioController {
  constructor(
    private readonly sistemaNacional: SistemaNacionalClient,
    private readonly organizacionesService: OrganizacionesService,
  ) {}

  @Get()
  @Roles(Rol.REPRESENTANTE_ONG)
  @ApiOperation({ summary: 'Inventario de la organizacion: total, comprometido y disponible' })
  @ApiResponse({ status: 200, type: InventarioResponseDto })
  async obtener(@CurrentUser() user: AuthenticatedUser): Promise<InventarioResponseDto> {
    return this.sistemaNacional.obtenerInventario(
      await this.codigoNacionalDe(user),
    ) as Promise<InventarioResponseDto>;
  }

  @Put()
  @Roles(Rol.REPRESENTANTE_ONG)
  @ApiOperation({ summary: 'Actualiza la cantidad total de las categorias informadas' })
  @ApiResponse({ status: 200, type: InventarioResponseDto })
  async actualizar(
    @Body() dto: ActualizarInventarioDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<InventarioResponseDto> {
    return this.sistemaNacional.actualizarInventario(
      await this.codigoNacionalDe(user),
      dto.recursos,
    ) as Promise<InventarioResponseDto>;
  }

  private async codigoNacionalDe(user: AuthenticatedUser): Promise<string> {
    if (!user.organizacionId) {
      throw new ForbiddenException('Su usuario no pertenece a ninguna organizacion');
    }

    const organizacion = await this.organizacionesService.findById(user.organizacionId);

    if (!organizacion.codigoNacional) {
      throw new BusinessException('Su organizacion no tiene codigo en el Sistema Nacional');
    }

    return organizacion.codigoNacional;
  }
}
