import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { Rol } from '../../../common/enums/rol.enum';
import { AuthenticatedUser } from '../../../security/interfaces/jwt-payload.interface';
import { LoteResponseDto } from '../dtos/lote-response.dto';
import { ChangeLoteDto } from '../dtos/request/change-lote.dto';
import { RegisterLoteDto } from '../dtos/request/register-lote.dto';
import { LotesService } from '../services/lotes.service';

/**
 * Ruta anidada bajo emergencias: un lote no tiene sentido por fuera de la
 * emergencia que lo motiva, y la URL lo deja explicito.
 *
 * El control de acceso se delega en la emergencia: si el usuario no puede
 * verla, tampoco sus lotes. La regla vive en un solo lugar en vez de
 * duplicarse aca.
 */
@ApiTags('Lotes')
@ApiBearerAuth('access-token')
@Controller({ path: 'emergencias/:emergenciaId/lotes', version: '1' })
export class LotesController {
  constructor(private readonly lotesService: LotesService) {}

  @Get()
  @ApiOperation({ summary: 'Lotes de necesidades de una emergencia' })
  @ApiResponse({ status: 200, type: [LoteResponseDto] })
  @ApiResponse({ status: 404, description: 'La emergencia no existe o no es visible' })
  getByEmergencia(
    @Param('emergenciaId', ParseIntPipe) emergenciaId: number,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<LoteResponseDto[]> {
    return this.lotesService.getByEmergencia(emergenciaId, user);
  }

  @Post()
  @Roles(Rol.CENTRO_COORDINADOR)
  @ApiOperation({ summary: 'Agrega un lote al desglose (eslabon 2)' })
  @ApiResponse({ status: 400, description: 'La emergencia no admite cambios en sus lotes' })
  create(
    @Param('emergenciaId', ParseIntPipe) emergenciaId: number,
    @Body() dto: RegisterLoteDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<LoteResponseDto> {
    return this.lotesService.create(emergenciaId, dto, user);
  }

  @Put(':id')
  @Roles(Rol.CENTRO_COORDINADOR)
  @ApiOperation({ summary: 'Reformula un lote' })
  update(
    @Param('emergenciaId', ParseIntPipe) emergenciaId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ChangeLoteDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<LoteResponseDto> {
    return this.lotesService.update(emergenciaId, id, dto, user);
  }

  @Delete(':id')
  @Roles(Rol.CENTRO_COORDINADOR)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Quita un lote del desglose' })
  delete(
    @Param('emergenciaId', ParseIntPipe) emergenciaId: number,
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    return this.lotesService.delete(emergenciaId, id, user);
  }
}
