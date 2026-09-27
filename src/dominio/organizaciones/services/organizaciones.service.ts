import { Injectable } from '@nestjs/common';
import { Organizacion } from '@prisma/client';
import { PageResponse } from '../../../common/dtos/page-response.dto';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { ResourceNotFoundException } from '../../../common/exceptions/resource-not-found.exception';
import { ChangeMiOrganizacionDto } from '../dtos/request/change-mi-organizacion.dto';
import { ChangeOrganizacionDto } from '../dtos/request/change-organizacion.dto';
import { FindOrganizacionesQuery } from '../dtos/request/find-organizaciones.query';
import { RegisterOrganizacionDto } from '../dtos/request/register-organizacion.dto';
import { OrganizacionResponseDto } from '../dtos/organizacion-response.dto';
import { OrganizacionRepository } from '../repositories/organizacion.repository';

@Injectable()
export class OrganizacionesService {
  constructor(private readonly organizacionRepository: OrganizacionRepository) {}

  /** Interno: lo usa UsuariosService para validar la pertenencia. */
  async findById(id: number): Promise<Organizacion> {
    const organizacion = await this.organizacionRepository.findById(id);

    if (!organizacion) {
      throw new ResourceNotFoundException(`Organizacion no encontrada con id: ${id}`);
    }

    return organizacion;
  }

  async getById(id: number): Promise<OrganizacionResponseDto> {
    return OrganizacionResponseDto.from(await this.findById(id));
  }

  async getAll(query: FindOrganizacionesQuery): Promise<PageResponse<OrganizacionResponseDto>> {
    const resultado = await this.organizacionRepository.buscar(
      { busqueda: query.busqueda?.trim() || undefined, tipo: query.tipo },
      query.skip,
      query.size,
    );

    return PageResponse.of(resultado, query.page, query.size, OrganizacionResponseDto.from);
  }

  async create(dto: RegisterOrganizacionDto): Promise<OrganizacionResponseDto> {
    await this.validarUnicidad(dto);

    const organizacion = await this.organizacionRepository.create({
      nombre: dto.nombre,
      tipo: dto.tipo,
      cuit: dto.cuit ?? null,
      codigoNacional: dto.codigoNacional ?? null,
      emailContacto: dto.emailContacto ?? null,
      telefonoContacto: dto.telefonoContacto ?? null,
      localidad: dto.localidad ?? null,
      provincia: dto.provincia ?? null,
    });

    return OrganizacionResponseDto.from(organizacion);
  }

  async update(id: number, dto: ChangeOrganizacionDto): Promise<OrganizacionResponseDto> {
    await this.findById(id);
    await this.validarUnicidad(dto, id);

    const organizacion = await this.organizacionRepository.update(id, {
      nombre: dto.nombre,
      cuit: dto.cuit ?? null,
      codigoNacional: dto.codigoNacional ?? null,
      emailContacto: dto.emailContacto ?? null,
      telefonoContacto: dto.telefonoContacto ?? null,
      localidad: dto.localidad ?? null,
      provincia: dto.provincia ?? null,
    });

    return OrganizacionResponseDto.from(organizacion);
  }

  /** Edicion que hace el referente sobre su propia organizacion. */
  async updateMiOrganizacion(
    id: number,
    dto: ChangeMiOrganizacionDto,
  ): Promise<OrganizacionResponseDto> {
    await this.findById(id);

    const organizacion = await this.organizacionRepository.update(id, {
      emailContacto: dto.emailContacto ?? null,
      telefonoContacto: dto.telefonoContacto ?? null,
      localidad: dto.localidad ?? null,
      provincia: dto.provincia ?? null,
    });

    return OrganizacionResponseDto.from(organizacion);
  }

  /**
   * Baja logica.
   *
   * Se bloquea si todavia tiene usuarios activos: dejarlos colgando de una
   * organizacion inactiva los convierte en usuarios que pueden entrar al
   * sistema pero no operar sobre nada, que es peor que no poder entrar. Hay
   * que dar de baja a las personas primero, y esa decision es de quien
   * administra, no del sistema.
   */
  async deactivate(id: number): Promise<void> {
    await this.findById(id);

    const usuariosActivos = await this.organizacionRepository.contarUsuariosActivos(id);

    if (usuariosActivos > 0) {
      throw new BusinessException(
        `No se puede dar de baja: la organizacion todavia tiene ${usuariosActivos} ` +
          `usuario(s) activo(s). De baja primero a las personas.`,
      );
    }

    await this.organizacionRepository.desactivar(id);
  }

  /**
   * Los tres campos unicos se validan antes de tocar la base para poder
   * devolver un 400 con un mensaje util. Si se dejara que reviente la
   * restriccion de Postgres, el filtro global lo traduciria a un 409 generico
   * que no dice cual de los tres campos choco.
   */
  private async validarUnicidad(
    dto: { nombre: string; cuit?: string; codigoNacional?: string },
    excluyendoId?: number,
  ): Promise<void> {
    if (await this.organizacionRepository.existsByNombre(dto.nombre, excluyendoId)) {
      throw new BusinessException('Ya existe una organizacion con ese nombre');
    }

    if (dto.cuit && (await this.organizacionRepository.existsByCuit(dto.cuit, excluyendoId))) {
      throw new BusinessException('Ya existe una organizacion con ese CUIT');
    }

    if (
      dto.codigoNacional &&
      (await this.organizacionRepository.existsByCodigoNacional(dto.codigoNacional, excluyendoId))
    ) {
      throw new BusinessException('Ya existe una organizacion con ese codigo nacional');
    }
  }
}
