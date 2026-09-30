import { ForbiddenException, Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { EstadoEmergencia, Prisma } from '@prisma/client';
import { PageResponse } from '../../../common/dtos/page-response.dto';
import { Rol, esAdmin } from '../../../common/enums/rol.enum';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { ResourceNotFoundException } from '../../../common/exceptions/resource-not-found.exception';
import { AuthenticatedUser } from '../../../security/interfaces/jwt-payload.interface';
import {
  AccionEmergencia,
  ESTADOS_VISIBLES_PARA_LA_RED,
  ESTADO_EDITABLE,
  TRANSICIONES,
} from '../emergencia-estados';
import { EmergenciaConRelaciones, EmergenciaResponseDto } from '../dtos/emergencia-response.dto';
import { CancelarEmergenciaDto } from '../dtos/request/cancelar-emergencia.dto';
import { ChangeEmergenciaDto } from '../dtos/request/change-emergencia.dto';
import { FindEmergenciasQuery } from '../dtos/request/find-emergencias.query';
import { PublicarConvocatoriaDto } from '../dtos/request/publicar-convocatoria.dto';
import { RegisterEmergenciaDto } from '../dtos/request/register-emergencia.dto';
import { BonitaProcesoService } from '../../../integracion/bonita/bonita-proceso.service';
import { LotesService } from '../../lotes/services/lotes.service';
import { EmergenciaRepository } from '../repositories/emergencia.repository';

@Injectable()
export class EmergenciasService {
  private readonly logger = new Logger(EmergenciasService.name);

  constructor(
    private readonly emergenciaRepository: EmergenciaRepository,
    // forwardRef: lotes tambien depende de emergencias, para resolver el
    // control de acceso. Ver el comentario en LotesModule.
    @Inject(forwardRef(() => LotesService))
    private readonly lotesService: LotesService,
    private readonly bonita: BonitaProcesoService,
  ) {}

  // ------------------------------------------------------------------
  // Alcance por filas
  // ------------------------------------------------------------------

  /**
   * Que emergencias puede ver cada perfil. Es la pieza del RBAC que no se
   * puede resolver con un decorador, porque no depende de que rol tenes sino
   * de a que filas tenes derecho.
   *
   * Devuelve una clausula de Prisma que el repositorio combina con los
   * filtros del cliente usando AND, de modo que ningun query param pueda
   * ampliarla.
   */
  private alcanceDe(user: AuthenticatedUser): Prisma.EmergenciaWhereInput {
    switch (user.rol) {
      // Transversales a la red: ven todo.
      case Rol.CENTRO_COORDINADOR:
      case Rol.AUDITOR:
      case Rol.ADMIN:
        return {};

      // Solo las de su propio municipio.
      case Rol.OPERADOR_MUNICIPAL:
        return { municipioId: user.organizacionId ?? -1 };

      /**
       * Solo las que ya se difundieron a la red. Una emergencia REGISTRADA
       * todavia no se publico: el Coordinador la esta desglosando en lotes, y
       * mostrarsela a las ONGs las llevaria a ofertar sobre necesidades que
       * todavia no existen.
       */
      case Rol.REPRESENTANTE_ONG:
        return { estado: { in: ESTADOS_VISIBLES_PARA_LA_RED } };

      default:
        return { id: -1 };
    }
  }

  /**
   * Busca por id respetando el alcance.
   *
   * Devuelve 404 y no 403 cuando la emergencia existe pero no es visible para
   * ese usuario. Es deliberado: un 403 confirmaria que el recurso existe, y
   * eso ya es informacion. Un municipio no tiene por que enterarse de cuantas
   * emergencias cargo el municipio vecino probando ids.
   */
  async findVisible(id: number, user: AuthenticatedUser): Promise<EmergenciaConRelaciones> {
    const emergencia = await this.emergenciaRepository.findById(id);

    if (!emergencia || !this.esVisiblePara(emergencia, user)) {
      throw new ResourceNotFoundException(`Emergencia no encontrada con id: ${id}`);
    }

    return emergencia;
  }

  private esVisiblePara(emergencia: EmergenciaConRelaciones, user: AuthenticatedUser): boolean {
    switch (user.rol) {
      case Rol.CENTRO_COORDINADOR:
      case Rol.AUDITOR:
      case Rol.ADMIN:
        return true;
      case Rol.OPERADOR_MUNICIPAL:
        return emergencia.municipioId === user.organizacionId;
      case Rol.REPRESENTANTE_ONG:
        return ESTADOS_VISIBLES_PARA_LA_RED.includes(emergencia.estado);
      default:
        return false;
    }
  }

  // ------------------------------------------------------------------
  // Lectura
  // ------------------------------------------------------------------

  async getById(id: number, user: AuthenticatedUser): Promise<EmergenciaResponseDto> {
    return EmergenciaResponseDto.from(await this.findVisible(id, user));
  }

  async getAll(
    query: FindEmergenciasQuery,
    user: AuthenticatedUser,
  ): Promise<PageResponse<EmergenciaResponseDto>> {
    const resultado = await this.emergenciaRepository.buscar(
      this.alcanceDe(user),
      {
        busqueda: query.busqueda?.trim() || undefined,
        estado: query.estado,
        gravedad: query.gravedad,
        tipo: query.tipo,
      },
      query.skip,
      query.size,
    );

    return PageResponse.of(resultado, query.page, query.size, EmergenciaResponseDto.from);
  }

  // ------------------------------------------------------------------
  // Escritura del municipio
  // ------------------------------------------------------------------

  /**
   * El municipio sale del token, no del body. Si viniera del request, un
   * operador podria registrar emergencias a nombre de otro municipio.
   */
  async create(
    dto: RegisterEmergenciaDto,
    user: AuthenticatedUser,
  ): Promise<EmergenciaResponseDto> {
    if (!user.organizacionId) {
      throw new ForbiddenException('Su usuario no pertenece a ningun municipio');
    }

    const emergencia = await this.emergenciaRepository.create({
      tipo: dto.tipo,
      gravedad: dto.gravedad,
      zonaAfectada: dto.zonaAfectada,
      descripcion: dto.descripcion,
      personasAfectadas: dto.personasAfectadas ?? null,
      fechaOcurrencia: dto.fechaOcurrencia,
      municipio: { connect: { id: user.organizacionId } },
      registradaPor: { connect: { id: user.id } },
    });

    this.logger.log(
      `Emergencia ${emergencia.id} registrada por ${user.email} ` +
        `(${emergencia.municipio.nombre}, gravedad ${emergencia.gravedad})`,
    );

    /**
     * Arranque del caso en Bonita, despues del commit y sin tumbar el alta si
     * falla: perder el registro de un desastre porque el motor estaba caido
     * seria mucho peor que quedar sin caso. Si queda sin caso, se le arranca
     * uno al publicar la convocatoria (ver asegurarCaso).
     */
    try {
      const caseId = await this.bonita.iniciarCaso(emergencia.id);

      if (caseId) {
        const conCaso = await this.emergenciaRepository.update(emergencia.id, {
          bonitaCaseId: caseId,
        });
        return EmergenciaResponseDto.from(conCaso);
      }
    } catch (error) {
      this.logger.error(
        `Emergencia ${emergencia.id} registrada sin caso de Bonita: ${this.motivo(error)}`,
      );
    }

    return EmergenciaResponseDto.from(emergencia);
  }

  async update(
    id: number,
    dto: ChangeEmergenciaDto,
    user: AuthenticatedUser,
  ): Promise<EmergenciaResponseDto> {
    const emergencia = await this.findVisible(id, user);

    this.exigirPropiedad(emergencia, user);

    /**
     * El estado es lo que acota esta operacion, no los campos. Una vez
     * publicada la convocatoria las ONGs ya ofertaron sobre la informacion
     * original: cambiarla despues invalidaria sus ofertas en silencio.
     */
    if (emergencia.estado !== ESTADO_EDITABLE) {
      throw new BusinessException(
        `Solo se puede editar una emergencia en estado ${ESTADO_EDITABLE}. ` +
          `Esta en ${emergencia.estado}.`,
      );
    }

    const actualizada = await this.emergenciaRepository.update(id, {
      tipo: dto.tipo,
      gravedad: dto.gravedad,
      zonaAfectada: dto.zonaAfectada,
      descripcion: dto.descripcion,
      personasAfectadas: dto.personasAfectadas ?? null,
      fechaOcurrencia: dto.fechaOcurrencia,
    });

    return EmergenciaResponseDto.from(actualizada);
  }

  // ------------------------------------------------------------------
  // Transiciones
  // ------------------------------------------------------------------

  async publicarConvocatoria(
    id: number,
    dto: PublicarConvocatoriaDto,
    user: AuthenticatedUser,
  ): Promise<EmergenciaResponseDto> {
    const emergencia = await this.transicionar(id, 'publicar-convocatoria', user);

    /**
     * Publicar una convocatoria sin necesidades cuantificadas deja a la red
     * sin saber sobre que ofertar. Es el desglose en lotes, justamente, lo
     * que convierte una alerta en una convocatoria.
     */
    const lotes = await this.lotesService.contarPorEmergencia(id);

    if (lotes === 0) {
      throw new BusinessException(
        'No se puede publicar la convocatoria sin lotes cargados. ' +
          'Desglose primero la emergencia en necesidades cuantificadas.',
      );
    }

    /**
     * Desde aca Bonita es quien lleva el tiempo: sin caso no hay temporizador
     * y la convocatoria no se cerraria nunca. Por eso, a diferencia del alta,
     * si el motor falla la publicacion falla (503) y la emergencia queda
     * REGISTRADA, en vez de abrir una ventana que nadie va a cerrar.
     */
    const caseId = await this.asegurarCaso(emergencia);
    await this.bonita.publicarConvocatoria(caseId);

    return this.aplicar(emergencia, 'publicar-convocatoria', {
      fechaCierreConvocatoria: dto.fechaCierreConvocatoria,
      bonitaCaseId: caseId || undefined,
    });
  }

  /**
   * La llama el conector de Bonita al vencer el temporizador, o el
   * Coordinador si quiere cerrar antes. En el segundo caso hay que avisarle al
   * motor; en el primero BonitaProcesoService detecta que no hace falta.
   */
  async cerrarConvocatoria(id: number, user: AuthenticatedUser): Promise<EmergenciaResponseDto> {
    const emergencia = await this.transicionar(id, 'cerrar-convocatoria', user);

    if (emergencia.bonitaCaseId) {
      await this.bonita.cerrarConvocatoria(emergencia.bonitaCaseId);
    }

    return this.aplicar(emergencia, 'cerrar-convocatoria');
  }

  async reabrirConvocatoria(
    id: number,
    dto: PublicarConvocatoriaDto,
    user: AuthenticatedUser,
  ): Promise<EmergenciaResponseDto> {
    const emergencia = await this.transicionar(id, 'reabrir-convocatoria', user);

    /**
     * El diagrama no tiene camino de vuelta: al cerrarse la convocatoria el
     * caso termino. Reabrir es arrancar un caso nuevo y llevarlo hasta
     * "Cargar / editar ofertas", que vuelve a poner el temporizador en marcha.
     * El caso anterior queda en el historial de Bonita.
     */
    const caseId = await this.bonita.iniciarCaso(emergencia.id);
    if (caseId) await this.bonita.publicarConvocatoria(caseId);

    return this.aplicar(emergencia, 'reabrir-convocatoria', {
      fechaCierreConvocatoria: dto.fechaCierreConvocatoria,
      bonitaCaseId: caseId ?? undefined,
    });
  }

  async habilitarAdjudicacion(id: number, user: AuthenticatedUser): Promise<EmergenciaResponseDto> {
    const emergencia = await this.transicionar(id, 'habilitar-adjudicacion', user);
    return this.aplicar(emergencia, 'habilitar-adjudicacion');
  }

  async adjudicar(id: number, user: AuthenticatedUser): Promise<EmergenciaResponseDto> {
    const emergencia = await this.transicionar(id, 'adjudicar', user);
    this.exigirPropiedad(emergencia, user);
    return this.aplicar(emergencia, 'adjudicar');
  }

  async finalizar(id: number, user: AuthenticatedUser): Promise<EmergenciaResponseDto> {
    const emergencia = await this.transicionar(id, 'finalizar', user);
    return this.aplicar(emergencia, 'finalizar');
  }

  async cancelar(
    id: number,
    dto: CancelarEmergenciaDto,
    user: AuthenticatedUser,
  ): Promise<EmergenciaResponseDto> {
    const emergencia = await this.transicionar(id, 'cancelar', user);

    // Un municipio solo cancela las suyas; el Coordinador puede cancelar
    // cualquiera, porque es quien arbitra la red.
    if (user.rol === Rol.OPERADOR_MUNICIPAL) {
      this.exigirPropiedad(emergencia, user);
    }

    const cancelada = await this.aplicar(emergencia, 'cancelar', { motivoCancelacion: dto.motivo });

    /**
     * Despues de persistir y sin tumbar la cancelacion si el motor falla: la
     * decision del usuario vale aunque Bonita este caido. Si el caso queda
     * vivo y el temporizador vence, el cierre se rechaza por estado invalido
     * y el error queda a la vista en el portal de Bonita.
     */
    if (emergencia.bonitaCaseId) {
      try {
        await this.bonita.cancelarCaso(emergencia.bonitaCaseId);
      } catch (error) {
        this.logger.error(
          `Emergencia ${id} cancelada, pero el caso ${emergencia.bonitaCaseId} ` +
            `sigue en Bonita: ${this.motivo(error)}`,
        );
      }
    }

    return cancelada;
  }

  // ------------------------------------------------------------------
  // Motor de transiciones
  // ------------------------------------------------------------------

  /**
   * Verifica que la accion sea legal para este usuario y este estado.
   *
   * Los dos controles viven aca y no solo en el @Roles del controller porque
   * el servicio puede invocarse desde otro lado: un conector de Bonita, un
   * job, otro servicio. El decorador corta el request; esta tabla protege la
   * regla.
   */
  private async transicionar(
    id: number,
    accion: AccionEmergencia,
    user: AuthenticatedUser,
  ): Promise<EmergenciaConRelaciones> {
    const emergencia = await this.findVisible(id, user);
    const transicion = TRANSICIONES[accion];

    if (!esAdmin(user.rol) && !transicion.quien.includes(user.rol)) {
      throw new ForbiddenException(
        `El perfil ${user.rol} no puede ${transicion.descripcion} de una emergencia`,
      );
    }

    if (!transicion.desde.includes(emergencia.estado)) {
      throw new BusinessException(
        `No se puede ${transicion.descripcion}: la emergencia esta en estado ` +
          `${emergencia.estado} y la accion requiere ${transicion.desde.join(' o ')}`,
      );
    }

    return emergencia;
  }

  private async aplicar(
    emergencia: EmergenciaConRelaciones,
    accion: AccionEmergencia,
    datosExtra: Prisma.EmergenciaUpdateInput = {},
  ): Promise<EmergenciaResponseDto> {
    const nuevoEstado: EstadoEmergencia = TRANSICIONES[accion].hacia;

    const actualizada = await this.emergenciaRepository.update(emergencia.id, {
      estado: nuevoEstado,
      ...datosExtra,
    });

    this.logger.log(`Emergencia ${emergencia.id}: ${emergencia.estado} -> ${nuevoEstado}`);

    return EmergenciaResponseDto.from(actualizada);
  }

  /**
   * Caso de Bonita de la emergencia. Si el alta no pudo crearlo (motor caido
   * en ese momento), se crea ahora. Devuelve '' con la integracion apagada.
   */
  private async asegurarCaso(emergencia: EmergenciaConRelaciones): Promise<string> {
    if (emergencia.bonitaCaseId || !this.bonita.habilitado) return emergencia.bonitaCaseId ?? '';

    this.logger.warn(`Emergencia ${emergencia.id} sin caso de Bonita: se inicia ahora`);
    return (await this.bonita.iniciarCaso(emergencia.id)) ?? '';
  }

  private motivo(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  /** El usuario tiene que pertenecer al municipio duenio de la emergencia. */
  private exigirPropiedad(emergencia: EmergenciaConRelaciones, user: AuthenticatedUser): void {
    if (!esAdmin(user.rol) && emergencia.municipioId !== user.organizacionId) {
      throw new ForbiddenException('La emergencia pertenece a otro municipio');
    }
  }
}
