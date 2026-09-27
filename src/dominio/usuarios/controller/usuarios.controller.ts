import {
  Body,
  Controller,
  Delete,
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
import { ChangeMiPerfilDto } from '../dtos/request/change-mi-perfil.dto';
import { ChangePasswordDto } from '../dtos/request/change-password.dto';
import { ChangeUsuarioDto } from '../dtos/request/change-usuario.dto';
import { FindUsuariosQuery } from '../dtos/request/find-usuarios.query';
import { RegisterUsuarioDto } from '../dtos/request/register-usuario.dto';
import { UsuarioResponseDto } from '../dtos/usuario-response.dto';
import { UsuariosService } from '../services/usuarios.service';

/**
 * Solo HTTP: recibe, delega y devuelve. Ninguna regla de negocio vive aca.
 *
 * La ruta final es /api/v1/usuarios (prefijo global + versionado en main.ts).
 */
@ApiTags('Usuarios')
@ApiBearerAuth('access-token')
@Controller({ path: 'usuarios', version: '1' })
export class UsuariosController {
  constructor(private readonly usuariosService: UsuariosService) {}

  @Post()
  @Roles(Rol.CENTRO_COORDINADOR)
  @ApiOperation({ summary: 'Da de alta un usuario (solo Centro Coordinador)' })
  @ApiResponse({ status: 201, type: UsuarioResponseDto })
  @ApiResponse({ status: 400, description: 'El email ya esta registrado' })
  create(@Body() dto: RegisterUsuarioDto): Promise<UsuarioResponseDto> {
    return this.usuariosService.create(dto);
  }

  @Get()
  @Roles(Rol.CENTRO_COORDINADOR, Rol.AUDITOR)
  @ApiOperation({ summary: 'Lista usuarios con filtros y paginacion' })
  getAll(@Query() query: FindUsuariosQuery): Promise<PageResponse<UsuarioResponseDto>> {
    return this.usuariosService.getAll(query);
  }

  // --------------------------------------------------------------------
  // Autogestion: el usuario sobre si mismo.
  //
  // Estas rutas van declaradas ANTES que las de ':id'. Nest resuelve por
  // orden de declaracion, asi que si ':id' estuviera primero capturaria la
  // palabra "me" como si fuera un id y el ParseIntPipe devolveria un 400.
  //
  // Ninguna lleva @Roles: cualquier usuario autenticado puede gestionar su
  // propia cuenta, sea del perfil que sea. El id sale del token, nunca de
  // la URL, asi que no hay forma de operar sobre la cuenta de otro.
  // --------------------------------------------------------------------

  @Patch('me')
  @ApiOperation({ summary: 'Actualiza los datos del usuario autenticado' })
  @ApiResponse({ status: 200, type: UsuarioResponseDto })
  @ApiResponse({ status: 400, description: 'Se intento editar un campo no permitido' })
  updateMiPerfil(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangeMiPerfilDto,
  ): Promise<UsuarioResponseDto> {
    return this.usuariosService.updateMiPerfil(user.id, dto);
  }

  @Patch('me/password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Cambia la contrasena del usuario autenticado' })
  @ApiResponse({ status: 204, description: 'Contrasena actualizada' })
  changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
  ): Promise<void> {
    return this.usuariosService.changePassword(user.id, dto);
  }

  @Delete('me')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Baja de la propia cuenta' })
  @ApiResponse({ status: 204, description: 'Cuenta dada de baja y sesiones cerradas' })
  deactivateSelf(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    return this.usuariosService.deactivateSelf(user.id);
  }

  // --------------------------------------------------------------------
  // Administracion: un perfil habilitado sobre cualquier usuario.
  // --------------------------------------------------------------------

  @Get(':id')
  @Roles(Rol.CENTRO_COORDINADOR, Rol.AUDITOR)
  @ApiOperation({ summary: 'Obtiene un usuario por id' })
  @ApiResponse({ status: 404, description: 'El usuario no existe' })
  getById(@Param('id', ParseIntPipe) id: number): Promise<UsuarioResponseDto> {
    return this.usuariosService.getById(id);
  }

  @Put(':id')
  @Roles(Rol.CENTRO_COORDINADOR)
  @ApiOperation({ summary: 'Actualiza los datos de un usuario' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ChangeUsuarioDto,
  ): Promise<UsuarioResponseDto> {
    return this.usuariosService.update(id, dto);
  }

  @Delete(':id')
  @Roles(Rol.CENTRO_COORDINADOR)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Da de baja un usuario (baja logica)' })
  deactivate(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    return this.usuariosService.deactivate(id, user.id);
  }
}
