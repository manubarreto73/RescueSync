import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { EstadoEmergencia, EstadoOferta, Prisma, TipoOrganizacion } from '@prisma/client';
import { PageResponse } from '../../../common/dtos/page-response.dto';
import { Rol, esAdmin } from '../../../common/enums/rol.enum';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { ResourceNotFoundException } from '../../../common/exceptions/resource-not-found.exception';
import { PrismaService } from '../../../prisma/prisma.service';
import { PrismaTransaction } from '../../../prisma/transaction.types';
import { AuthenticatedUser } from '../../../security/interfaces/jwt-payload.interface';
import { EmergenciasService } from '../../emergencias/services/emergencias.service';
import { OrganizacionesService } from '../../organizaciones/services/organizaciones.service';
import { OfertaConRelaciones, OfertaResponseDto } from '../dtos/oferta-response.dto';
import { ChangeOfertaDto } from '../dtos/request/change-oferta.dto';
import { FindOfertasQuery } from '../dtos/request/find-ofertas.query';
import { LineaOfertaDto, RegisterOfertaDto } from '../dtos/request/register-oferta.dto';
import { RechazarOfertaDto } from '../dtos/request/rechazar-oferta.dto';
import { ValidarOfertasDto } from '../dtos/request/validar-ofertas.dto';
import { OfertaRepository } from '../repositories/oferta.repository';

/** Estados de la oferta que todavia admiten edicion. */
const EDITABLES: EstadoOferta[] = [EstadoOferta.BORRADOR, EstadoOferta.PRESENTADA];

/** Tipos de organizacion habilitados a ofertar. */
const PUEDEN_OFERTAR: TipoOrganizacion[] = [
  TipoOrganizacion.ONG,
  TipoOrganizacion.ORGANISMO_RESCATE,
];

@Injectable()
export class OfertasService {
  private readonly logger = new Logger(OfertasService.name);

  constructor(
    private readonly ofertaRepository: OfertaRepository,
    private readonly emergenciasService: EmergenciasService,
    private readonly organizacionesService: OrganizacionesService,
    private readonly prisma: PrismaService,
  ) {}

  // ------------------------------------------------------------------
  // Alcance por filas
  // ------------------------------------------------------------------

  /**
   * Quien ve que ofertas. Es la regla mas delicada de todo el sistema.
   *
   * Una ONG solo ve las ofertas en las que participa. Si viera las de las
   * demas durante la ventana de convocatoria, podria mirar lo que oferto la
   * competencia antes de cerrar la suya, y eso rompe el proceso entero, no
   * solo la privacidad.
   *
   * El municipio solo ve las de sus emergencias y solo una vez validadas:
   * la consigna es explicita en que "visualiza unicamente las ofertas
   * validadas".
   */
  private alcanceDe(user: AuthenticatedUser): Prisma.OfertaWhereInput {
    switch (user.rol) {
      case Rol.CENTRO_COORDINADOR:
      case Rol.AUDITOR:
      case Rol.ADMIN:
        return {};

      case Rol.REPRESENTANTE_ONG:
        return { participantes: { some: { organizacionId: user.organizacionId ?? -1 } } };

      case Rol.OPERADOR_MUNICIPAL:
        return {
          emergencia: { municipioId: user.organizacionId ?? -1 },
          estado: {
            in: [
              EstadoOferta.VALIDADA,
              EstadoOferta.ADJUDICADA,
              EstadoOferta.NO_ADJUDICADA,
              EstadoOferta.FINALIZADA,
            ],
          },
        };

      default:
        return { id: -1 };
    }
  }

  private esVisiblePara(oferta: OfertaConRelaciones, user: AuthenticatedUser): boolean {
    switch (user.rol) {
      case Rol.CENTRO_COORDINADOR:
      case Rol.AUDITOR:
      case Rol.ADMIN:
        return true;
      case Rol.REPRESENTANTE_ONG:
        return oferta.participantes.some((p) => p.organizacionId === user.organizacionId);
      case Rol.OPERADOR_MUNICIPAL:
        return (
          oferta.estado !== EstadoOferta.BORRADOR &&
          oferta.estado !== EstadoOferta.PRESENTADA &&
          oferta.estado !== EstadoOferta.RETIRADA
        );
      default:
        return false;
    }
  }

  async findVisible(id: number, user: AuthenticatedUser): Promise<OfertaConRelaciones> {
    const oferta = await this.ofertaRepository.findById(id);

    if (!oferta || !this.esVisiblePara(oferta, user)) {
      throw new ResourceNotFoundException(`Oferta no encontrada con id: ${id}`);
    }

    // El municipio ademas solo ve las de sus propias emergencias.
    if (user.rol === Rol.OPERADOR_MUNICIPAL) {
      const emergencia = await this.emergenciasService.findVisible(oferta.emergenciaId, user);
      if (emergencia.municipioId !== user.organizacionId) {
        throw new ResourceNotFoundException(`Oferta no encontrada con id: ${id}`);
      }
    }

    return oferta;
  }

  // ------------------------------------------------------------------
  // Lectura
  // ------------------------------------------------------------------

  async getById(id: number, user: AuthenticatedUser): Promise<OfertaResponseDto> {
    return OfertaResponseDto.from(await this.findVisible(id, user));
  }

  async getAll(
    query: FindOfertasQuery,
    user: AuthenticatedUser,
  ): Promise<PageResponse<OfertaResponseDto>> {
    const resultado = await this.ofertaRepository.buscar(
      this.alcanceDe(user),
      { emergenciaId: query.emergenciaId, estado: query.estado },
      query.skip,
      query.size,
    );

    return PageResponse.of(resultado, query.page, query.size, OfertaResponseDto.from);
  }

  async getVersiones(id: number, user: AuthenticatedUser) {
    await this.findVisible(id, user);
    return this.ofertaRepository.listarVersiones(id);
  }

  /**
   * Listado consolidado que consulta Bonita al vencer el temporizador.
   *
   * Es el punto de integracion que define la consigna: "una tarea de servicio
   * o conector en Bonita realizara una peticion HTTP hacia un endpoint del
   * backend para solicitar el listado consolidado de ofertas asociadas a esa
   * emergencia".
   *
   * Devuelve solo las PRESENTADAS: los borradores no son ofertas todavia, y
   * las retiradas dejaron de serlo.
   */
  async consolidadoParaBonita(emergenciaId: number, user: AuthenticatedUser) {
    const emergencia = await this.emergenciasService.findVisible(emergenciaId, user);

    const ofertas = await this.ofertaRepository.findPorEmergencia(emergenciaId, [
      EstadoOferta.PRESENTADA,
      EstadoOferta.VALIDADA,
    ]);

    return {
      emergenciaId: emergencia.id,
      estadoEmergencia: emergencia.estado,
      fechaCierreConvocatoria: emergencia.fechaCierreConvocatoria,
      totalOfertas: ofertas.length,
      ofertas: ofertas.map((o) => ({
        ofertaId: o.id,
        estado: o.estado,
        esConsorcio: o.participantes.length > 1,
        organizaciones: o.participantes.map((p) => ({
          organizacionId: p.organizacionId,
          nombre: p.organizacion.nombre,
          // El Sistema Nacional identifica a las ONGs por este codigo.
          codigoNacional: p.organizacion.codigoNacional,
          esLider: p.esLider,
        })),
        lineas: o.lineas.map((l) => ({
          lineaId: l.id,
          loteId: l.loteId,
          loteDescripcion: l.lote.descripcion,
          organizacionId: l.organizacionId,
          codigoNacional:
            o.participantes.find((p) => p.organizacionId === l.organizacionId)?.organizacion
              .codigoNacional ?? null,
          cantidad: l.cantidad,
          unidad: l.lote.unidad,
          cantidadRequeridaDelLote: l.lote.cantidadRequerida,
        })),
      })),
    };
  }

  // ------------------------------------------------------------------
  // Alta y edicion
  // ------------------------------------------------------------------

  async create(dto: RegisterOfertaDto, user: AuthenticatedUser): Promise<OfertaResponseDto> {
    const organizacionLiderId = this.exigirOrganizacion(user);

    const emergencia = await this.emergenciasService.findVisible(dto.emergenciaId, user);
    this.exigirVentanaAbierta(emergencia.estado);

    const participantes = await this.resolverParticipantes(
      organizacionLiderId,
      dto.organizacionesAsociadas ?? [],
    );

    await this.validarLineas(dto.lineas, dto.emergenciaId, participantes);

    /**
     * Transaccion: la oferta, sus participantes y sus lineas son una sola
     * cosa. Una oferta a medio grabar, sin lineas o sin consorcio, no es una
     * oferta parcial: es basura que despues hay que limpiar a mano.
     */
    const oferta = await this.prisma.$transaction(async (tx) => {
      const creada = await this.ofertaRepository.create(
        {
          emergencia: { connect: { id: dto.emergenciaId } },
          organizacionLider: { connect: { id: organizacionLiderId } },
          presentadaPor: { connect: { id: user.id } },
          observaciones: dto.observaciones ?? null,
          participantes: {
            create: participantes.map((id) => ({
              organizacionId: id,
              esLider: id === organizacionLiderId,
            })),
          },
          lineas: {
            create: dto.lineas.map((l) => ({
              loteId: l.loteId,
              organizacionId: l.organizacionId,
              cantidad: l.cantidad,
            })),
          },
        },
        tx,
      );

      await this.guardarSnapshot(creada, user.id, tx);
      return creada;
    });

    this.logger.log(
      `Oferta ${oferta.id} creada para la emergencia ${dto.emergenciaId} ` +
        `por ${oferta.organizacionLider.nombre}` +
        (participantes.length > 1 ? ` (consorcio de ${participantes.length})` : ''),
    );

    return OfertaResponseDto.from(oferta);
  }

  /**
   * Edicion dentro de la ventana.
   *
   * Cada guardado incrementa la version y deja el detalle anterior en
   * OfertaVersion: es la trazabilidad que pide la consigna. Sin eso, una ONG
   * podria bajar su ofrecimiento sobre el cierre y nadie tendria como
   * demostrar que antes ofrecia otra cosa.
   */
  async update(
    id: number,
    dto: ChangeOfertaDto,
    user: AuthenticatedUser,
  ): Promise<OfertaResponseDto> {
    const oferta = await this.findVisible(id, user);

    this.exigirLider(oferta, user);

    if (!EDITABLES.includes(oferta.estado)) {
      throw new BusinessException(
        `No se puede editar una oferta en estado ${oferta.estado}. ` +
          `Solo se permite en ${EDITABLES.join(' o ')}.`,
      );
    }

    const emergencia = await this.emergenciasService.findVisible(oferta.emergenciaId, user);
    this.exigirVentanaAbierta(emergencia.estado);

    const participantes = await this.resolverParticipantes(
      oferta.organizacionLiderId,
      dto.organizacionesAsociadas ?? [],
    );

    await this.validarLineas(dto.lineas, oferta.emergenciaId, participantes);

    const actualizada = await this.prisma.$transaction(async (tx) => {
      await this.ofertaRepository.reemplazarParticipantes(
        oferta.id,
        participantes.map((orgId) => ({
          organizacionId: orgId,
          esLider: orgId === oferta.organizacionLiderId,
        })),
        tx,
      );

      await this.ofertaRepository.reemplazarLineas(oferta.id, dto.lineas, tx);

      const conCambios = await this.ofertaRepository.update(
        oferta.id,
        { version: { increment: 1 }, observaciones: dto.observaciones ?? null },
        tx,
      );

      await this.guardarSnapshot(conCambios, user.id, tx);
      return conCambios;
    });

    return OfertaResponseDto.from(actualizada);
  }

  // ------------------------------------------------------------------
  // Transiciones
  // ------------------------------------------------------------------

  async presentar(id: number, user: AuthenticatedUser): Promise<OfertaResponseDto> {
    const oferta = await this.findVisible(id, user);
    this.exigirLider(oferta, user);
    this.exigirEstado(oferta, [EstadoOferta.BORRADOR]);

    const emergencia = await this.emergenciasService.findVisible(oferta.emergenciaId, user);
    this.exigirVentanaAbierta(emergencia.estado);

    return OfertaResponseDto.from(
      await this.ofertaRepository.update(id, {
        estado: EstadoOferta.PRESENTADA,
        fechaPresentacion: new Date(),
      }),
    );
  }

  async retirar(id: number, user: AuthenticatedUser): Promise<OfertaResponseDto> {
    const oferta = await this.findVisible(id, user);
    this.exigirLider(oferta, user);
    this.exigirEstado(oferta, [EstadoOferta.BORRADOR, EstadoOferta.PRESENTADA]);

    const emergencia = await this.emergenciasService.findVisible(oferta.emergenciaId, user);
    this.exigirVentanaAbierta(emergencia.estado);

    return OfertaResponseDto.from(
      await this.ofertaRepository.update(id, { estado: EstadoOferta.RETIRADA }),
    );
  }

  /**
   * Aplica el resultado de la validacion externa.
   *
   * Lo invoca Bonita tras consultar al Sistema Nacional. No hay rechazo: cada
   * linea recibe un caracter (principal o apoyo secundario) segun el nivel de
   * competencia que devolvio el organismo, y la oferta queda VALIDADA.
   */
  async validarDeEmergencia(
    emergenciaId: number,
    dto: ValidarOfertasDto,
    user: AuthenticatedUser,
  ): Promise<{ ofertasValidadas: number; lineasClasificadas: number }> {
    await this.emergenciasService.findVisible(emergenciaId, user);

    const ofertas = await this.ofertaRepository.findPorEmergencia(emergenciaId, [
      EstadoOferta.PRESENTADA,
    ]);

    const lineasDeLaEmergencia = new Set(ofertas.flatMap((o) => o.lineas.map((l) => l.id)));

    const desconocidas = dto.resultados.filter((r) => !lineasDeLaEmergencia.has(r.lineaId));

    if (desconocidas.length > 0) {
      throw new BusinessException(
        `Las lineas ${desconocidas.map((d) => d.lineaId).join(', ')} no pertenecen a ` +
          `ofertas presentadas de la emergencia ${emergenciaId}`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      for (const resultado of dto.resultados) {
        await this.ofertaRepository.actualizarLinea(
          resultado.lineaId,
          {
            caracter: resultado.caracter,
            perfilCompetencia: resultado.perfilCompetencia ?? null,
          },
          tx,
        );
      }

      for (const oferta of ofertas) {
        await this.ofertaRepository.update(oferta.id, { estado: EstadoOferta.VALIDADA }, tx);
      }
    });

    this.logger.log(
      `Emergencia ${emergenciaId}: ${ofertas.length} ofertas validadas, ` +
        `${dto.resultados.length} lineas clasificadas`,
    );

    return { ofertasValidadas: ofertas.length, lineasClasificadas: dto.resultados.length };
  }

  async adjudicar(id: number, user: AuthenticatedUser): Promise<OfertaResponseDto> {
    const oferta = await this.findVisible(id, user);
    this.exigirEstado(oferta, [EstadoOferta.VALIDADA]);

    const emergencia = await this.emergenciasService.findVisible(oferta.emergenciaId, user);

    if (!esAdmin(user.rol) && emergencia.municipioId !== user.organizacionId) {
      throw new ForbiddenException('La emergencia pertenece a otro municipio');
    }

    if (emergencia.estado !== EstadoEmergencia.EN_ADJUDICACION) {
      throw new BusinessException(
        `Solo se pueden adjudicar ofertas con la emergencia en ` +
          `${EstadoEmergencia.EN_ADJUDICACION}. Esta en ${emergencia.estado}.`,
      );
    }

    return OfertaResponseDto.from(
      await this.ofertaRepository.update(id, {
        estado: EstadoOferta.ADJUDICADA,
        fechaAdjudicacion: new Date(),
      }),
    );
  }

  async rechazar(
    id: number,
    dto: RechazarOfertaDto,
    user: AuthenticatedUser,
  ): Promise<OfertaResponseDto> {
    const oferta = await this.findVisible(id, user);
    this.exigirEstado(oferta, [EstadoOferta.VALIDADA]);

    const emergencia = await this.emergenciasService.findVisible(oferta.emergenciaId, user);

    if (!esAdmin(user.rol) && emergencia.municipioId !== user.organizacionId) {
      throw new ForbiddenException('La emergencia pertenece a otro municipio');
    }

    return OfertaResponseDto.from(
      await this.ofertaRepository.update(id, {
        estado: EstadoOferta.NO_ADJUDICADA,
        motivoNoAdjudicacion: dto.motivo,
      }),
    );
  }

  /**
   * Cierre bilateral del eslabon 7.
   *
   * Cada ONG del consorcio marca su propia parte como terminada. La oferta
   * pasa a FINALIZADA recien cuando lo hicieron todas: es lo que despues
   * habilita a liberar los recursos en el Sistema Nacional.
   */
  async finalizarParticipacion(id: number, user: AuthenticatedUser): Promise<OfertaResponseDto> {
    const oferta = await this.findVisible(id, user);
    const organizacionId = this.exigirOrganizacion(user);

    this.exigirEstado(oferta, [EstadoOferta.ADJUDICADA]);

    const participante = oferta.participantes.find((p) => p.organizacionId === organizacionId);

    if (!participante) {
      throw new ForbiddenException('Su organizacion no participa de esta oferta');
    }

    if (participante.finalizado) {
      throw new BusinessException('Su organizacion ya marco su participacion como finalizada');
    }

    const actualizada = await this.prisma.$transaction(async (tx) => {
      await this.ofertaRepository.marcarParticipanteFinalizado(id, organizacionId, tx);

      const refrescada = await this.ofertaRepository.findById(id, tx);
      const todosListos = refrescada?.participantes.every((p) => p.finalizado) ?? false;

      if (todosListos) {
        return this.ofertaRepository.update(id, { estado: EstadoOferta.FINALIZADA }, tx);
      }

      return refrescada!;
    });

    return OfertaResponseDto.from(actualizada);
  }

  // ------------------------------------------------------------------
  // Reglas auxiliares
  // ------------------------------------------------------------------

  private exigirOrganizacion(user: AuthenticatedUser): number {
    if (!user.organizacionId) {
      throw new ForbiddenException('Su usuario no pertenece a ninguna organizacion');
    }
    return user.organizacionId;
  }

  private exigirLider(oferta: OfertaConRelaciones, user: AuthenticatedUser): void {
    if (!esAdmin(user.rol) && oferta.organizacionLiderId !== user.organizacionId) {
      throw new ForbiddenException(
        'Solo la organizacion que lidera el consorcio puede modificar la oferta',
      );
    }
  }

  private exigirEstado(oferta: OfertaConRelaciones, admitidos: EstadoOferta[]): void {
    if (!admitidos.includes(oferta.estado)) {
      throw new BusinessException(
        `La oferta esta en estado ${oferta.estado} y la accion requiere ` + admitidos.join(' o '),
      );
    }
  }

  private exigirVentanaAbierta(estado: EstadoEmergencia): void {
    if (estado !== EstadoEmergencia.CONVOCATORIA_ABIERTA) {
      throw new BusinessException(
        'La ventana de convocatoria no esta abierta para esta emergencia ' + `(esta en ${estado})`,
      );
    }
  }

  /**
   * Arma el consorcio y verifica que todos puedan ofertar.
   *
   * El lider siempre entra, y se descartan repetidos: mandar dos veces la
   * misma organizacion no es un error del usuario que valga la pena
   * reportar, es ruido de la interfaz.
   */
  private async resolverParticipantes(liderId: number, asociadas: number[]): Promise<number[]> {
    const ids = [...new Set([liderId, ...asociadas])];

    for (const id of ids) {
      const organizacion = await this.organizacionesService.findById(id);

      if (!PUEDEN_OFERTAR.includes(organizacion.tipo)) {
        throw new BusinessException(
          `"${organizacion.nombre}" es de tipo ${organizacion.tipo} y no puede ofertar. ` +
            `Solo pueden hacerlo las organizaciones de tipo ${PUEDEN_OFERTAR.join(' o ')}.`,
        );
      }
    }

    return ids;
  }

  /**
   * Verifica que cada linea apunte a un lote de esta emergencia y a una
   * organizacion que efectivamente participe del consorcio.
   *
   * Lo segundo es lo importante: sin esta validacion, una ONG podria armar un
   * consorcio y despues declarar aportes a nombre de organizaciones que nunca
   * aceptaron participar.
   */
  private async validarLineas(
    lineas: LineaOfertaDto[],
    emergenciaId: number,
    participantes: number[],
  ): Promise<void> {
    const lotes = await this.prisma.lote.findMany({
      where: { emergenciaId },
      select: { id: true },
    });
    const lotesValidos = new Set(lotes.map((l) => l.id));

    const vistas = new Set<string>();

    for (const linea of lineas) {
      if (!lotesValidos.has(linea.loteId)) {
        throw new BusinessException(
          `El lote ${linea.loteId} no pertenece a la emergencia ${emergenciaId}`,
        );
      }

      if (!participantes.includes(linea.organizacionId)) {
        throw new BusinessException(
          `La organizacion ${linea.organizacionId} aporta en una linea pero no figura ` +
            `entre los participantes de la oferta`,
        );
      }

      const clave = `${linea.loteId}-${linea.organizacionId}`;

      if (vistas.has(clave)) {
        throw new BusinessException(
          `Hay dos lineas para el lote ${linea.loteId} y la misma organizacion. ` +
            `Unifiquelas en una sola con la cantidad total.`,
        );
      }

      vistas.add(clave);
    }
  }

  /** Congela el detalle actual de la oferta como una version. */
  private async guardarSnapshot(
    oferta: OfertaConRelaciones,
    usuarioId: number,
    tx: PrismaTransaction,
  ): Promise<void> {
    await this.ofertaRepository.guardarVersion(
      oferta.id,
      oferta.version,
      {
        observaciones: oferta.observaciones,
        participantes: oferta.participantes.map((p) => ({
          organizacionId: p.organizacionId,
          esLider: p.esLider,
        })),
        lineas: oferta.lineas.map((l) => ({
          loteId: l.loteId,
          organizacionId: l.organizacionId,
          cantidad: l.cantidad,
        })),
      },
      usuarioId,
      tx,
    );
  }
}
