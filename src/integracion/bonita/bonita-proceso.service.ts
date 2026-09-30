import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ActorBonita, BonitaClient, BonitaException, BonitaTarea } from './bonita.client';

/**
 * Nombres de las tareas humanas tal como estan en el diagrama. Si alguien las
 * renombra en el Studio, la integracion deja de encontrarlas: tienen que
 * coincidir letra por letra.
 */
export const TAREAS = {
  /** Lane "Municipio afectado". Contrato: { id: Integer } con el id de la emergencia. */
  REGISTRAR_EMERGENCIA: { nombre: 'Registrar emergencia', actor: 'municipio' },
  /** Lane "Centro Coordinador Regional". Sin contrato. */
  GENERAR_LOTES: { nombre: 'Generar lotes', actor: 'coordinador' },
  /**
   * Lane "Representante de ONG". Tiene el temporizador de borde: si vence
   * antes de que se complete, Bonita sigue por la tarea de servicio que llama
   * a POST /emergencias/:id/cerrar-convocatoria.
   */
  CARGAR_OFERTAS: { nombre: 'Cargar / editar ofertas', actor: 'ong' },
} as const satisfies Record<string, { nombre: string; actor: ActorBonita }>;

type Tarea = (typeof TAREAS)[keyof typeof TAREAS];

/**
 * El Operador municipal es el actor iniciador del proceso: instancia los
 * casos y, como duenio de la emergencia, los da de baja.
 */
const INICIADOR: ActorBonita = 'municipio';

/** Cuanto se espera a que el motor cree la tarea siguiente. */
const ESPERA_TAREA = { intentos: 20, intervaloMs: 300 };

/**
 * Orquestacion del proceso de RescueSync en Bonita.
 *
 * Cada metodo es un paso de negocio y se traduce en las tareas del diagrama
 * que hay que ejecutar, cada una con el usuario de Bonita de su actor. El RBAC
 * de quien puede hacer cada cosa lo resuelve la app antes de llegar aca;
 * Bonita lleva el hilo del proceso y el temporizador.
 *
 * Con BONITA_ENABLED=false todos los metodos son no-ops, asi la API funciona
 * (y se testea) sin el motor.
 */
@Injectable()
export class BonitaProcesoService {
  private readonly logger = new Logger(BonitaProcesoService.name);

  readonly habilitado: boolean;
  private readonly processName: string;
  private readonly processVersion?: string;

  /** El id del proceso no cambia mientras no se redespliegue. */
  private procesoId: string | null = null;

  constructor(
    private readonly client: BonitaClient,
    config: ConfigService,
  ) {
    this.habilitado = config.get<boolean>('bonita.enabled', false);
    this.processName = config.getOrThrow<string>('bonita.processName');
    this.processVersion = config.get<string>('bonita.processVersion');
  }

  /**
   * Arranca el caso de una emergencia recien registrada: instancia el proceso
   * y completa "Registrar emergencia" pasandole el id, que queda en la
   * variable de proceso `id` y es lo que despues usa el conector de cierre
   * para armar la URL.
   *
   * Devuelve el id del caso, o null con la integracion apagada.
   */
  async iniciarCaso(emergenciaId: number): Promise<string | null> {
    if (!this.habilitado) return null;

    const caseId = await this.client.instanciar(INICIADOR, await this.obtenerProcesoId());

    try {
      await this.ejecutar(caseId, TAREAS.REGISTRAR_EMERGENCIA, { id: emergenciaId });
    } catch (error) {
      // Un caso que nunca recibio el id no sirve: el conector de cierre no
      // sabria a que emergencia apuntar. Mejor no dejarlo huerfano.
      await this.borrarCaso(caseId);
      throw error;
    }

    this.logger.log(`Emergencia ${emergenciaId}: caso ${caseId} iniciado en Bonita`);
    return caseId;
  }

  /**
   * El Coordinador termino el desglose y publica: se completa "Generar
   * lotes", y el caso queda en "Cargar / editar ofertas" con el temporizador
   * corriendo.
   */
  async publicarConvocatoria(caseId: string): Promise<void> {
    if (!this.habilitado) return;

    await this.ejecutar(caseId, TAREAS.GENERAR_LOTES);
    this.logger.log(`Caso ${caseId}: convocatoria abierta, temporizador en marcha`);
  }

  /**
   * Cierre de la ventana.
   *
   * Si lo dispara el temporizador, Bonita ya abandono "Cargar / editar
   * ofertas" y esta llamando a la API desde el conector: no hay nada que
   * hacer en el motor. Si lo fuerza el Coordinador antes de tiempo, la tarea
   * sigue pendiente y hay que completarla; si no, el temporizador venceria
   * despues y el conector intentaria cerrar una convocatoria ya cerrada.
   */
  async cerrarConvocatoria(caseId: string): Promise<void> {
    if (!this.habilitado) return;

    const { nombre, actor } = TAREAS.CARGAR_OFERTAS;
    const tarea = await this.client.buscarTareaPendiente(actor, caseId, nombre);

    if (!tarea) {
      this.logger.log(`Caso ${caseId}: convocatoria cerrada por el temporizador de Bonita`);
      return;
    }

    await this.client.ejecutarTarea(actor, tarea.id);
    this.logger.log(`Caso ${caseId}: convocatoria cerrada antes del vencimiento`);
  }

  /**
   * Una emergencia cancelada no tiene que seguir viva en el motor: con la
   * convocatoria abierta, el temporizador venceria y llamaria a la API sobre
   * una emergencia que ya no existe para el proceso.
   */
  async cancelarCaso(caseId: string): Promise<void> {
    if (!this.habilitado) return;

    await this.borrarCaso(caseId);
    this.logger.log(`Caso ${caseId}: eliminado de Bonita por cancelacion`);
  }

  // ------------------------------------------------------------------

  private async obtenerProcesoId(): Promise<string> {
    if (this.procesoId) return this.procesoId;

    const proceso = await this.client.buscarProceso(
      INICIADOR,
      this.processName,
      this.processVersion,
    );

    if (!proceso) {
      throw new BonitaException(
        `No hay un proceso "${this.processName}"` +
          (this.processVersion ? ` version ${this.processVersion}` : '') +
          ' desplegado y habilitado en Bonita',
      );
    }

    this.logger.log(`Proceso ${proceso.name} ${proceso.version} (id ${proceso.id})`);
    this.procesoId = proceso.id;
    return proceso.id;
  }

  private async ejecutar(
    caseId: string,
    { nombre, actor }: Tarea,
    contrato: Record<string, unknown> = {},
  ): Promise<void> {
    const tarea = await this.esperarTarea(actor, caseId, nombre);
    await this.client.ejecutarTarea(actor, tarea.id, contrato);
  }

  /**
   * Bonita crea la tarea siguiente de forma asincronica, en su propio pool de
   * trabajo: justo despues de instanciar o de ejecutar la anterior puede no
   * existir todavia. Se sondea un rato corto antes de darla por perdida.
   */
  private async esperarTarea(
    actor: ActorBonita,
    caseId: string,
    nombre: string,
  ): Promise<BonitaTarea> {
    for (let intento = 1; intento <= ESPERA_TAREA.intentos; intento++) {
      const tarea = await this.client.buscarTareaPendiente(actor, caseId, nombre);
      if (tarea) return tarea;
      await new Promise((resolve) => setTimeout(resolve, ESPERA_TAREA.intervaloMs));
    }

    throw new BonitaException(
      `El caso ${caseId} de Bonita no tiene pendiente la tarea "${nombre}". ` +
        'El proceso puede estar en otro paso o haber fallado.',
    );
  }

  private async borrarCaso(caseId: string): Promise<void> {
    try {
      await this.client.borrarCaso(INICIADOR, caseId);
    } catch (error) {
      // Si ya no existe (termino, o alguien lo borro desde el portal), no hay
      // nada que limpiar.
      if (error instanceof BonitaException && error.statusBonita === 404) return;
      throw error;
    }
  }
}
