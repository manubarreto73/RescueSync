import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { Rol } from '../../../common/enums/rol.enum';
import { AuthenticatedUser } from '../../../security/interfaces/jwt-payload.interface';
import { ValidarOfertasDto } from '../dtos/request/validar-ofertas.dto';
import { OfertasService } from '../services/ofertas.service';

/**
 * Los dos endpoints que consume Bonita, en su propio controller porque
 * cuelgan de la emergencia y no de la oferta.
 *
 * Es el mecanismo que fija la consigna: Bonita inicia la comunicacion. Al
 * vencer el temporizador hace un GET del consolidado, se lo manda al Sistema
 * Nacional, y devuelve los resultados por POST.
 */
@ApiTags('Ofertas')
@ApiBearerAuth('access-token')
@Controller({ path: 'emergencias/:emergenciaId/ofertas', version: '1' })
export class OfertasDeEmergenciaController {
  constructor(private readonly ofertasService: OfertasService) {}

  @Get('consolidado')
  @Roles(Rol.CENTRO_COORDINADOR, Rol.AUDITOR)
  @ApiOperation({
    summary: 'Listado consolidado de ofertas de la emergencia (lo consulta Bonita)',
  })
  @ApiResponse({ status: 200, description: 'Ofertas presentadas con sus lineas y organizaciones' })
  consolidado(
    @Param('emergenciaId', ParseIntPipe) emergenciaId: number,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ofertasService.consolidadoParaBonita(emergenciaId, user);
  }

  @Post('validar')
  @Roles(Rol.CENTRO_COORDINADOR)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Aplica el resultado de la validacion del Sistema Nacional (eslabon 4)',
  })
  validar(
    @Param('emergenciaId', ParseIntPipe) emergenciaId: number,
    @Body() dto: ValidarOfertasDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ofertasService.validarDeEmergencia(emergenciaId, dto, user);
  }
}
