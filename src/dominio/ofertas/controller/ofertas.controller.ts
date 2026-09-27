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
import { OfertaResponseDto } from '../dtos/oferta-response.dto';
import { ChangeOfertaDto } from '../dtos/request/change-oferta.dto';
import { FindOfertasQuery } from '../dtos/request/find-ofertas.query';
import { RechazarOfertaDto } from '../dtos/request/rechazar-oferta.dto';
import { RegisterOfertaDto } from '../dtos/request/register-oferta.dto';
import { OfertasService } from '../services/ofertas.service';

@ApiTags('Ofertas')
@ApiBearerAuth('access-token')
@Controller({ path: 'ofertas', version: '1' })
export class OfertasController {
  constructor(private readonly ofertasService: OfertasService) {}

  @Post()
  @Roles(Rol.REPRESENTANTE_ONG)
  @ApiOperation({ summary: 'Crea una oferta, individual o en consorcio (eslabon 3)' })
  @ApiResponse({ status: 201, type: OfertaResponseDto })
  create(
    @Body() dto: RegisterOfertaDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<OfertaResponseDto> {
    return this.ofertasService.create(dto, user);
  }

  /**
   * Cada perfil ve un subconjunto distinto: la ONG solo aquellas en las que
   * participa, el municipio solo las validadas de sus emergencias, el
   * Coordinador y el Auditor todas.
   */
  @Get()
  @ApiOperation({ summary: 'Lista ofertas segun el alcance del perfil' })
  getAll(
    @Query() query: FindOfertasQuery,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PageResponse<OfertaResponseDto>> {
    return this.ofertasService.getAll(query, user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtiene una oferta por id' })
  getById(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<OfertaResponseDto> {
    return this.ofertasService.getById(id, user);
  }

  /** La trazabilidad de ediciones que pide la consigna. */
  @Get(':id/versiones')
  @ApiOperation({ summary: 'Historial de modificaciones de la oferta' })
  getVersiones(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser) {
    return this.ofertasService.getVersiones(id, user);
  }

  @Put(':id')
  @Roles(Rol.REPRESENTANTE_ONG)
  @ApiOperation({ summary: 'Actualiza la oferta dentro de la ventana (nueva version)' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ChangeOfertaDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<OfertaResponseDto> {
    return this.ofertasService.update(id, dto, user);
  }

  @Post(':id/presentar')
  @Roles(Rol.REPRESENTANTE_ONG)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Envia la oferta a la convocatoria' })
  presentar(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<OfertaResponseDto> {
    return this.ofertasService.presentar(id, user);
  }

  @Post(':id/retirar')
  @Roles(Rol.REPRESENTANTE_ONG)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Da de baja la oferta dentro de la ventana' })
  retirar(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<OfertaResponseDto> {
    return this.ofertasService.retirar(id, user);
  }

  @Post(':id/adjudicar')
  @Roles(Rol.OPERADOR_MUNICIPAL)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'El municipio selecciona esta oferta (eslabon 5)' })
  adjudicar(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<OfertaResponseDto> {
    return this.ofertasService.adjudicar(id, user);
  }

  @Post(':id/rechazar')
  @Roles(Rol.OPERADOR_MUNICIPAL)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'El municipio descarta esta oferta con un motivo' })
  rechazar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RechazarOfertaDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<OfertaResponseDto> {
    return this.ofertasService.rechazar(id, dto, user);
  }

  /** Eslabon 7: cada ONG del consorcio da por terminada su parte. */
  @Post(':id/finalizar-participacion')
  @Roles(Rol.REPRESENTANTE_ONG)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'La ONG marca su participacion como finalizada' })
  finalizarParticipacion(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<OfertaResponseDto> {
    return this.ofertasService.finalizarParticipacion(id, user);
  }
}
