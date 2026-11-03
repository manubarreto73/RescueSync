import { Controller, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { Rol } from '../../../common/enums/rol.enum';
import { AuthenticatedUser } from '../../../security/interfaces/jwt-payload.interface';
import { NotificacionResponseDto } from '../dtos/notificacion-response.dto';
import { NotificacionesService } from '../services/notificaciones.service';

@ApiTags('Notificaciones')
@ApiBearerAuth('access-token')
@Controller({ path: 'notificaciones', version: '1' })
export class NotificacionesController {
  constructor(private readonly notificacionesService: NotificacionesService) {}

  @Get()
  @Roles(Rol.REPRESENTANTE_ONG)
  @ApiOperation({ summary: 'Notificaciones de la organizacion del usuario' })
  @ApiResponse({ status: 200, type: [NotificacionResponseDto] })
  listar(@CurrentUser() user: AuthenticatedUser): Promise<NotificacionResponseDto[]> {
    return this.notificacionesService.listar(user);
  }

  @Post(':id/leida')
  @Roles(Rol.REPRESENTANTE_ONG)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Marca una notificacion como leida' })
  @ApiResponse({ status: 200, type: NotificacionResponseDto })
  marcarLeida(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<NotificacionResponseDto> {
    return this.notificacionesService.marcarLeida(id, user);
  }
}
