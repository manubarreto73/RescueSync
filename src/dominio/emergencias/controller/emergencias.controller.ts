import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { PageResponse } from '../../../common/dtos/page-response.dto';
import { Rol } from '../../../common/enums/rol.enum';
import { AuthenticatedUser } from '../../../security/interfaces/jwt-payload.interface';
import { EmergenciaResponseDto } from '../dtos/emergencia-response.dto';
import { CancelarEmergenciaDto } from '../dtos/request/cancelar-emergencia.dto';
import { ChangeEmergenciaDto } from '../dtos/request/change-emergencia.dto';
import { FindEmergenciasQuery } from '../dtos/request/find-emergencias.query';
import { PublicarConvocatoriaDto } from '../dtos/request/publicar-convocatoria.dto';
import { RegisterEmergenciaDto } from '../dtos/request/register-emergencia.dto';
import { EmergenciasService } from '../services/emergencias.service';

/**
 * Las transiciones de estado son endpoints con nombre de negocio y no un
 * PATCH generico con { estado: "X" }.
 *
 * El motivo: cada una tiene precondiciones, permisos y datos propios.
 * Publicar exige una fecha de cierre, cancelar exige un motivo, adjudicar
 * solo lo puede hacer el municipio duenio. Un PATCH generico obligaria a un
 * switch gigante en el servicio y haria imposible expresar los permisos con
 * decoradores.
 */
@ApiTags('Emergencias')
@ApiBearerAuth('access-token')
@Controller({ path: 'emergencias', version: '1' })
export class EmergenciasController {
  constructor(private readonly emergenciasService: EmergenciasService) {}

  @Post()
  @Roles(Rol.OPERADOR_MUNICIPAL)
  @ApiOperation({ summary: 'Registra una emergencia (eslabon 1 del proceso)' })
  @ApiResponse({ status: 201, type: EmergenciaResponseDto })
  create(
    @Body() dto: RegisterEmergenciaDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<EmergenciaResponseDto> {
    return this.emergenciasService.create(dto, user);
  }

  /**
   * Abierto a los cuatro perfiles, pero cada uno ve un subconjunto distinto:
   * el municipio las suyas, la ONG las ya publicadas a la red, el Coordinador
   * y el Auditor todas. El recorte lo hace el servicio, no el decorador.
   */
  @Get()
  @ApiOperation({ summary: 'Lista emergencias segun el alcance del perfil' })
  getAll(
    @Query() query: FindEmergenciasQuery,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PageResponse<EmergenciaResponseDto>> {
    return this.emergenciasService.getAll(query, user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtiene una emergencia por id' })
  @ApiResponse({ status: 404, description: 'No existe o no es visible para este perfil' })
  getById(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<EmergenciaResponseDto> {
    return this.emergenciasService.getById(id, user);
  }

  @Put(':id')
  @Roles(Rol.OPERADOR_MUNICIPAL)
  @ApiOperation({ summary: 'Corrige los datos cargados (solo en estado REGISTRADA)' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ChangeEmergenciaDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<EmergenciaResponseDto> {
    return this.emergenciasService.update(id, dto, user);
  }

  // ------------------------------------------------------------------
  // Transiciones de estado
  // ------------------------------------------------------------------

  @Post(':id/publicar-convocatoria')
  @Roles(Rol.CENTRO_COORDINADOR)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Abre la ventana de ofertas a toda la red (eslabon 2)' })
  @ApiResponse({ status: 400, description: 'Estado incorrecto o fecha de cierre invalida' })
  publicarConvocatoria(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: PublicarConvocatoriaDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<EmergenciaResponseDto> {
    return this.emergenciasService.publicarConvocatoria(id, dto, user);
  }

  /**
   * La va a disparar el temporizador de Bonita al vencer la ventana. El
   * Coordinador tambien puede forzarla: si los lotes ya estan cubiertos no
   * tiene sentido esperar al vencimiento.
   */
  @Post(':id/cerrar-convocatoria')
  @Roles(Rol.CENTRO_COORDINADOR)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cierra la ventana de ofertas (eslabon 4)' })
  cerrarConvocatoria(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<EmergenciaResponseDto> {
    return this.emergenciasService.cerrarConvocatoria(id, user);
  }

  /**
   * El camino alternativo que pide la consigna: si vencio el timer y los
   * lotes no se cubrieron, el Coordinador reabre con una fecha nueva.
   */
  @Post(':id/reabrir-convocatoria')
  @Roles(Rol.CENTRO_COORDINADOR)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reabre la convocatoria con una fecha nueva' })
  reabrirConvocatoria(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: PublicarConvocatoriaDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<EmergenciaResponseDto> {
    return this.emergenciasService.reabrirConvocatoria(id, dto, user);
  }

  @Post(':id/habilitar-adjudicacion')
  @Roles(Rol.CENTRO_COORDINADOR)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Habilita al municipio a elegir entre las ofertas validadas' })
  habilitarAdjudicacion(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<EmergenciaResponseDto> {
    return this.emergenciasService.habilitarAdjudicacion(id, user);
  }

  @Post(':id/adjudicar')
  @Roles(Rol.OPERADOR_MUNICIPAL)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Adjudica y arranca el despliegue (eslabon 5)' })
  adjudicar(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<EmergenciaResponseDto> {
    return this.emergenciasService.adjudicar(id, user);
  }

  @Post(':id/finalizar')
  @Roles(Rol.CENTRO_COORDINADOR)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cierre operativo (eslabon 7)' })
  finalizar(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<EmergenciaResponseDto> {
    return this.emergenciasService.finalizar(id, user);
  }

  @Post(':id/cancelar')
  @Roles(Rol.OPERADOR_MUNICIPAL, Rol.CENTRO_COORDINADOR)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancela la emergencia con un motivo' })
  @ApiResponse({ status: 400, description: 'No se puede cancelar una emergencia en ejecucion' })
  cancelar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CancelarEmergenciaDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<EmergenciaResponseDto> {
    return this.emergenciasService.cancelar(id, dto, user);
  }
}
