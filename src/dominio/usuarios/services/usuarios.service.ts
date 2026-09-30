import { Injectable } from '@nestjs/common';
import { TipoOrganizacion, Usuario } from '@prisma/client';
import { PageResponse } from '../../../common/dtos/page-response.dto';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { ResourceNotFoundException } from '../../../common/exceptions/resource-not-found.exception';
import { PasswordService } from '../../../security/password.service';
import { SessionRevocationService } from '../../../security/session-revocation.service';
import { ChangeMiPerfilDto } from '../dtos/request/change-mi-perfil.dto';
import { ChangePasswordDto } from '../dtos/request/change-password.dto';
import { ChangeUsuarioDto } from '../dtos/request/change-usuario.dto';
import { FindUsuariosQuery } from '../dtos/request/find-usuarios.query';
import { RegisterUsuarioDto } from '../dtos/request/register-usuario.dto';
import { UsuarioResponseDto } from '../dtos/usuario-response.dto';
import { Rol } from '../../../common/enums/rol.enum';
import { OrganizacionesService } from '../../organizaciones/services/organizaciones.service';
import { UsuarioRepository } from '../repositories/usuario.repository';

/**
 * Que tipo de organizacion puede respaldar a cada perfil.
 *
 * Un array vacio significa que ese rol no necesita organizacion: el Centro
 * Coordinador y el Auditor son transversales a la red, no pertenecen a
 * ninguno de sus miembros.
 */
const ORGANIZACION_SEGUN_ROL: Record<Rol, TipoOrganizacion[]> = {
  [Rol.OPERADOR_MUNICIPAL]: [TipoOrganizacion.MUNICIPIO],
  [Rol.REPRESENTANTE_ONG]: [TipoOrganizacion.ONG, TipoOrganizacion.ORGANISMO_RESCATE],
  [Rol.CENTRO_COORDINADOR]: [],
  [Rol.AUDITOR]: [],
  [Rol.ADMIN]: [],
};

/**
 * Reglas de negocio de usuarios. Es el unico que decide; el controller no
 * valida nada mas alla de la forma del DTO y el repositorio no decide nada.
 */
@Injectable()
export class UsuariosService {
  constructor(
    private readonly usuarioRepository: UsuarioRepository,
    private readonly passwordService: PasswordService,
    private readonly revocacion: SessionRevocationService,
    private readonly organizacionesService: OrganizacionesService,
  ) {}

  /**
   * Metodo interno: devuelve el modelo completo (con hash) para que lo usen
   * otros servicios del backend. Nunca se expone por HTTP.
   */
  async findById(id: number): Promise<Usuario> {
    const usuario = await this.usuarioRepository.findById(id);

    if (!usuario) {
      throw new ResourceNotFoundException(`Usuario no encontrado con id: ${id}`);
    }

    return usuario;
  }

  async findByEmailParaLogin(email: string): Promise<Usuario | null> {
    return this.usuarioRepository.findByEmailIncluyendoInactivos(email);
  }

  /**
   * Para el refresh de tokens. A diferencia de findById, devuelve tambien
   * usuarios dados de baja: es auth quien decide que hacer con ellos, y la
   * respuesta correcta ahi es 401, no 404.
   */
  async findByIdParaAuth(id: number): Promise<Usuario | null> {
    return this.usuarioRepository.findByIdIncluyendoInactivos(id);
  }

  async getById(id: number): Promise<UsuarioResponseDto> {
    return UsuarioResponseDto.from(await this.findById(id));
  }

  async getAll(query: FindUsuariosQuery): Promise<PageResponse<UsuarioResponseDto>> {
    const resultado = await this.usuarioRepository.buscar(
      { busqueda: query.busqueda?.trim() || undefined, rol: query.rol },
      query.skip,
      query.size,
    );

    return PageResponse.of(resultado, query.page, query.size, UsuarioResponseDto.from);
  }

  async create(dto: RegisterUsuarioDto): Promise<UsuarioResponseDto> {
    if (await this.usuarioRepository.existsByEmail(dto.email)) {
      throw new BusinessException('Ya existe un usuario registrado con ese email');
    }

    await this.validarPertenencia(dto.rol, dto.organizacionId);

    const usuario = await this.usuarioRepository.create({
      email: dto.email,
      password: await this.passwordService.hash(dto.password),
      nombreCompleto: dto.nombreCompleto,
      telefono: dto.telefono ?? null,
      rol: dto.rol,
      ...(dto.organizacionId ? { organizacion: { connect: { id: dto.organizacionId } } } : {}),
    });

    return UsuarioResponseDto.from(usuario);
  }

  async update(id: number, dto: ChangeUsuarioDto): Promise<UsuarioResponseDto> {
    await this.findById(id); // 404 si no existe o esta dado de baja

    if (await this.usuarioRepository.existsByEmail(dto.email, id)) {
      throw new BusinessException('Ya existe otro usuario registrado con ese email');
    }

    await this.validarPertenencia(dto.rol, dto.organizacionId);

    const usuario = await this.usuarioRepository.update(id, {
      email: dto.email,
      nombreCompleto: dto.nombreCompleto,
      telefono: dto.telefono ?? null,
      rol: dto.rol,
      // null desvincula la organizacion, un id valido la reasigna.
      organizacion: dto.organizacionId
        ? { connect: { id: dto.organizacionId } }
        : { disconnect: true },
    });

    return UsuarioResponseDto.from(usuario);
  }

  /**
   * Edicion que hace el usuario sobre si mismo.
   *
   * El id viene del token, nunca de la URL ni del body: asi no existe forma
   * de que un usuario edite el perfil de otro, ni siquiera manipulando el
   * request. Los campos editables los acota ChangeMiPerfilDto.
   */
  async updateMiPerfil(id: number, dto: ChangeMiPerfilDto): Promise<UsuarioResponseDto> {
    await this.findById(id);

    const usuario = await this.usuarioRepository.update(id, {
      nombreCompleto: dto.nombreCompleto,
      telefono: dto.telefono ?? null,
    });

    return UsuarioResponseDto.from(usuario);
  }

  /**
   * Baja que hace el usuario sobre si mismo.
   *
   * Ademas de marcar la fila como inactiva, revoca las sesiones abiertas.
   * Sin eso la baja no tendria efecto inmediato: el access token que el
   * usuario tiene en la mano es un JWT firmado y valido, y lo seguiria
   * siendo hasta que expire, aunque su cuenta ya no exista para la app.
   */
  async deactivateSelf(id: number): Promise<void> {
    await this.findById(id);
    await this.usuarioRepository.desactivar(id);
    await this.revocacion.revocarUsuario(id);
  }

  /**
   * Solo el propio usuario puede cambiar su contrasena, y tiene que conocer
   * la actual: alcanza con robar un access token para hacer requests, pero no
   * para apropiarse de la cuenta.
   */
  async changePassword(id: number, dto: ChangePasswordDto): Promise<void> {
    const usuario = await this.findById(id);

    const coincide = await this.passwordService.compare(dto.passwordActual, usuario.password);

    if (!coincide) {
      throw new BusinessException('La contrasena actual es incorrecta');
    }

    if (dto.passwordActual === dto.passwordNueva) {
      throw new BusinessException('La contrasena nueva debe ser distinta de la actual');
    }

    await this.usuarioRepository.update(id, {
      password: await this.passwordService.hash(dto.passwordNueva),
    });
  }

  /**
   * Baja administrativa. Para darse de baja a si mismo esta deactivateSelf:
   * son operaciones distintas, con permisos distintos, y mezclarlas haria que
   * un error de id pudiera dejar sin cuenta a quien ejecuta la accion.
   */
  async deactivate(id: number, solicitanteId: number): Promise<void> {
    if (id === solicitanteId) {
      throw new BusinessException('Para darse de baja a si mismo use DELETE /usuarios/me');
    }

    await this.findById(id);
    await this.usuarioRepository.desactivar(id);

    // Tambien hay que cortarle las sesiones abiertas, igual que en la baja
    // propia: si no, sigue operando hasta que le venza el token.
    await this.revocacion.revocarUsuario(id);
  }

  async registrarAcceso(id: number): Promise<void> {
    await this.usuarioRepository.registrarAcceso(id);
  }

  /**
   * Coherencia entre el perfil y la organizacion que lo respalda.
   *
   * Es una regla de negocio y no una restriccion de base: la foreign key sabe
   * que la organizacion existe, pero no que un REPRESENTANTE_ONG no puede
   * colgar de un MUNICIPIO. Si se colara, ese usuario tendria permisos de ONG
   * sobre los datos de un municipio.
   */
  private async validarPertenencia(rol: Rol, organizacionId?: number): Promise<void> {
    // El superusuario de desarrollo no se da de alta por la API: si un
    // coordinador pudiera crearlo, se estaria dando a si mismo mas permisos.
    if (rol === Rol.ADMIN) {
      throw new BusinessException('El perfil ADMIN solo se crea desde el seed de desarrollo');
    }

    const tiposAdmitidos = ORGANIZACION_SEGUN_ROL[rol];
    const necesitaOrganizacion = tiposAdmitidos.length > 0;

    if (!organizacionId) {
      if (necesitaOrganizacion) {
        throw new BusinessException(
          `Un usuario con perfil ${rol} debe pertenecer a una organizacion de tipo ` +
            tiposAdmitidos.join(' o '),
        );
      }
      return;
    }

    if (!necesitaOrganizacion) {
      throw new BusinessException(
        `Un usuario con perfil ${rol} no pertenece a ninguna organizacion de la red`,
      );
    }

    // findById tira 404 si no existe o esta dada de baja.
    const organizacion = await this.organizacionesService.findById(organizacionId);

    if (!tiposAdmitidos.includes(organizacion.tipo)) {
      throw new BusinessException(
        `La organizacion "${organizacion.nombre}" es de tipo ${organizacion.tipo}, ` +
          `y el perfil ${rol} requiere ${tiposAdmitidos.join(' o ')}`,
      );
    }
  }
}
