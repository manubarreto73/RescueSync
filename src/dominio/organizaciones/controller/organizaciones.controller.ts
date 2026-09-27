import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
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
import { OrganizacionResponseDto } from '../dtos/organizacion-response.dto';
import { ChangeMiOrganizacionDto } from '../dtos/request/change-mi-organizacion.dto';
import { ChangeOrganizacionDto } from '../dtos/request/change-organizacion.dto';
import { FindOrganizacionesQuery } from '../dtos/request/find-organizaciones.query';
import { RegisterOrganizacionDto } from '../dtos/request/register-organizacion.dto';
import { OrganizacionesService } from '../services/organizaciones.service';

@ApiTags('Organizaciones')
@ApiBearerAuth('access-token')
@Controller({ path: 'organizaciones', version: '1' })
export class OrganizacionesController {
  constructor(private readonly organizacionesService: OrganizacionesService) {}

  @Post()
  @Roles(Rol.CENTRO_COORDINADOR)
  @ApiOperation({ summary: 'Da de alta una organizacion en la red' })
  @ApiResponse({ status: 201, type: OrganizacionResponseDto })
  create(@Body() dto: RegisterOrganizacionDto): Promise<OrganizacionResponseDto> {
    return this.organizacionesService.create(dto);
  }

  /**
   * El REPRESENTANTE_ONG entra en el listado y no es un descuido: la consigna
   * pide que las ONGs puedan asociarse en consorcios "mediante la interfaz",
   * y para eso tienen que poder encontrar a las otras.
   *
   * El OPERADOR_MUNICIPAL queda afuera porque no le encontre un caso de uso:
   * la convocatoria la difunde el Centro Coordinador a toda la red, el
   * municipio no elige a quien invitar.
   */
  @Get()
  @Roles(Rol.CENTRO_COORDINADOR, Rol.AUDITOR, Rol.REPRESENTANTE_ONG)
  @ApiOperation({ summary: 'Lista las organizaciones de la red' })
  getAll(@Query() query: FindOrganizacionesQuery): Promise<PageResponse<OrganizacionResponseDto>> {
    return this.organizacionesService.getAll(query);
  }

  // --------------------------------------------------------------------
  // Autogestion. Declaradas antes que las de ':id' para que Nest no capture
  // la palabra "mia" como si fuera un id.
  // --------------------------------------------------------------------

  @Get('mia')
  @ApiOperation({ summary: 'Datos de la organizacion a la que pertenece el usuario' })
  @ApiResponse({ status: 403, description: 'El usuario no pertenece a ninguna organizacion' })
  getMiOrganizacion(@CurrentUser() user: AuthenticatedUser): Promise<OrganizacionResponseDto> {
    return this.organizacionesService.getById(this.organizacionDe(user));
  }

  @Patch('mia')
  @Roles(Rol.OPERADOR_MUNICIPAL, Rol.REPRESENTANTE_ONG)
  @ApiOperation({ summary: 'Actualiza los datos de contacto de la propia organizacion' })
  updateMiOrganizacion(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangeMiOrganizacionDto,
  ): Promise<OrganizacionResponseDto> {
    return this.organizacionesService.updateMiOrganizacion(this.organizacionDe(user), dto);
  }

  // --------------------------------------------------------------------
  // Administracion
  // --------------------------------------------------------------------

  @Get(':id')
  @Roles(Rol.CENTRO_COORDINADOR, Rol.AUDITOR, Rol.REPRESENTANTE_ONG)
  @ApiOperation({ summary: 'Obtiene una organizacion por id' })
  getById(@Param('id', ParseIntPipe) id: number): Promise<OrganizacionResponseDto> {
    return this.organizacionesService.getById(id);
  }

  @Put(':id')
  @Roles(Rol.CENTRO_COORDINADOR)
  @ApiOperation({ summary: 'Actualiza una organizacion' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ChangeOrganizacionDto,
  ): Promise<OrganizacionResponseDto> {
    return this.organizacionesService.update(id, dto);
  }

  @Delete(':id')
  @Roles(Rol.CENTRO_COORDINADOR)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Da de baja una organizacion (baja logica)' })
  @ApiResponse({ status: 400, description: 'Todavia tiene usuarios activos' })
  deactivate(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.organizacionesService.deactivate(id);
  }

  /**
   * Un CENTRO_COORDINADOR o un AUDITOR pueden no pertenecer a ninguna
   * organizacion, asi que las rutas de autogestion no aplican para ellos.
   * Es 403 y no 404: el recurso no falta, es el usuario el que no tiene
   * una organizacion sobre la cual operar.
   */
  private organizacionDe(user: AuthenticatedUser): number {
    if (!user.organizacionId) {
      throw new ForbiddenException('Su usuario no pertenece a ninguna organizacion');
    }

    return user.organizacionId;
  }
}
