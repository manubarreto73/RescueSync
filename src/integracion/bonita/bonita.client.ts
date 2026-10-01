import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Proceso desplegado, tal como lo devuelve /API/bpm/process. */
export interface BonitaProceso {
  id: string;
  name: string;
  version: string;
  activationState: string;
}

/** Tarea humana, tal como la devuelve /API/bpm/humanTask. */
export interface BonitaTarea {
  id: string;
  name: string;
  state: string;
  caseId: string;
  assigned_id: string;
}

/**
 * Los tres actores del diagrama. Cada uno opera con su propio usuario de
 * Bonita, el que esta mapeado a ese actor en el proceso desplegado: asi el
 * historial del caso muestra quien hizo cada paso, y no un unico tecnico.
 */
export type ActorBonita = 'admin' | 'municipio' | 'coordinador' | 'ong';

interface Credenciales {
  username: string;
  password: string;
}

interface Sesion {
  /** Cookies a reenviar tal cual (JSESSIONID, X-Bonita-API-Token, bonita.tenant). */
  cookie: string;
  /** Token anti-CSRF: Bonita lo exige como header en todo POST, PUT y DELETE. */
  apiToken: string;
}

/**
 * Error de Bonita con el status HTTP original. Se propaga como 503 al cliente
 * de la API: para quien usa la app, el motor caido o rechazando la operacion
 * es un servicio no disponible, no un error suyo.
 */
export class BonitaException extends ServiceUnavailableException {
  constructor(
    message: string,
    readonly statusBonita?: number,
  ) {
    super(message);
  }
}

/**
 * Cliente de la API REST de Bonita. Es el equivalente a un RestTemplate
 * configurado: sabe autenticarse, mantener la sesion y hablar el dialecto de
 * Bonita, pero no sabe nada del proceso de RescueSync. Eso vive en
 * BonitaProcesoService.
 *
 * Hay una sesion por actor, compartida entre todos los requests de la API: el
 * usuario de la app ya fue autorizado por el RBAC propio antes de llegar aca,
 * y en Bonita se actua con la cuenta mapeada al actor de la tarea.
 * Las consultas globales de catalogo y tareas se ejecutan con la sesion 'admin'.
 */
@Injectable()
export class BonitaClient {
  private readonly logger = new Logger(BonitaClient.name);

  private readonly url: string;
  private readonly credenciales: Record<ActorBonita, Credenciales>;
  private readonly timeoutMs: number;

  /**
   * Promesas y no valores: si llegan dos requests con la sesion vencida, los
   * dos esperan el mismo login en vez de abrir dos sesiones.
   */
  private readonly sesiones = new Map<ActorBonita, Promise<Sesion>>();

  constructor(config: ConfigService) {
    this.url = config.getOrThrow<string>('bonita.url');
    this.credenciales = config.getOrThrow<Record<ActorBonita, Credenciales>>('bonita.usuarios');
    this.timeoutMs = config.get<number>('bonita.timeoutMs', 10000);
  }

  // ------------------------------------------------------------------
  // Procesos y casos
  // ------------------------------------------------------------------

  /** Proceso habilitado con ese nombre; sin version, el ultimo desplegado. Consulta con admin. */
  async buscarProceso(
    nombre: string,
    version?: string,
  ): Promise<BonitaProceso | null> {
    const filtros = [`name=${nombre}`, 'activationState=ENABLED'];
    if (version) filtros.push(`version=${version}`);

    const procesos = await this.get<BonitaProceso[]>('admin', '/API/bpm/process', {
      p: '0',
      c: '1',
      o: 'deploymentDate DESC',
      f: filtros,
    });

    return procesos[0] ?? null;
  }

  /** Instancia el proceso y devuelve el id del caso. */
  async instanciar(
    actor: ActorBonita,
    procesoId: string,
    contrato: Record<string, unknown> = {},
  ): Promise<string> {
    const { caseId } = await this.request<{ caseId: number }>(
      actor,
      'POST',
      `/API/bpm/process/${procesoId}/instantiation`,
      { body: contrato },
    );
    return String(caseId);
  }

  /** Borra el caso del motor, con todas sus tareas pendientes. Ejecuta con admin. */
  async borrarCaso(caseId: string): Promise<void> {
    await this.request('admin', 'DELETE', `/API/bpm/case/${caseId}`);
  }

  // ------------------------------------------------------------------
  // Tareas humanas
  // ------------------------------------------------------------------

  /** Tarea lista para ejecutar en ese caso, o null si no hay ninguna. Consulta con admin. */
  async buscarTareaPendiente(
    caseId: string,
    nombre: string,
  ): Promise<BonitaTarea | null> {
    const tareas = await this.get<BonitaTarea[]>('admin', '/API/bpm/humanTask', {
      p: '0',
      c: '1',
      f: [`caseId=${caseId}`, `name=${nombre}`, 'state=ready'],
    });

    return tareas[0] ?? null;
  }

  /**
   * Asigna la tarea al usuario del actor y la ejecuta, en un solo llamado
   * (assign=true). El contrato viaja en el body; una tarea sin contrato recibe
   * un objeto vacio.
   */
  async ejecutarTarea(
    actor: ActorBonita,
    tareaId: string,
    contrato: Record<string, unknown> = {},
  ): Promise<void> {
    await this.request(actor, 'POST', `/API/bpm/userTask/${tareaId}/execution`, {
      query: { assign: 'true' },
      body: contrato,
    });
  }

  // ------------------------------------------------------------------
  // Sesion
  // ------------------------------------------------------------------

  private obtenerSesion(actor: ActorBonita): Promise<Sesion> {
    let sesion = this.sesiones.get(actor);

    if (!sesion) {
      sesion = this.login(this.credenciales[actor]).catch((error: unknown) => {
        // Un login fallido no se cachea: el proximo request vuelve a intentar.
        this.sesiones.delete(actor);
        throw error;
      });
      this.sesiones.set(actor, sesion);
    }

    return sesion;
  }

  /**
   * POST /loginservice con redirect=false: en vez de redirigir al portal,
   * devuelve 204 con las cookies de sesion. El token anti-CSRF llega como
   * cookie X-Bonita-API-Token, y hay que reenviarlo como header.
   */
  private async login({ username, password }: Credenciales): Promise<Sesion> {
    const response = await this.fetch(`${this.url}/loginservice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        username,
        password,
        redirect: 'false',
      }),
    });

    if (!response.ok) {
      throw new BonitaException(
        `Bonita rechazo el login de "${username}" (HTTP ${response.status})`,
        response.status,
      );
    }

    const cookies = response.headers
      .getSetCookie()
      .map((c) => c.split(';')[0])
      .filter(Boolean);

    const apiToken = cookies
      .find((c) => c.startsWith('X-Bonita-API-Token='))
      ?.slice('X-Bonita-API-Token='.length);

    if (!apiToken) {
      throw new BonitaException('Bonita no devolvio el X-Bonita-API-Token al iniciar sesion');
    }

    this.logger.log(`Sesion abierta en Bonita como ${username}`);

    return { cookie: cookies.join('; '), apiToken };
  }

  // ------------------------------------------------------------------
  // HTTP
  // ------------------------------------------------------------------

  private get<T>(
    actor: ActorBonita,
    ruta: string,
    query: Record<string, string | string[]>,
  ): Promise<T> {
    return this.request<T>(actor, 'GET', ruta, { query });
  }

  /**
   * Request autenticado. Si Bonita contesta 401 la sesion vencio (o el motor
   * se reinicio): se descarta, se abre otra y se reintenta una unica vez.
   */
  private async request<T = void>(
    actor: ActorBonita,
    metodo: 'GET' | 'POST' | 'PUT' | 'DELETE',
    ruta: string,
    opciones: { query?: Record<string, string | string[]>; body?: unknown } = {},
    reintento = true,
  ): Promise<T> {
    const sesion = await this.obtenerSesion(actor);

    const url = new URL(`${this.url}${ruta}`);
    for (const [clave, valor] of Object.entries(opciones.query ?? {})) {
      for (const v of Array.isArray(valor) ? valor : [valor]) url.searchParams.append(clave, v);
    }

    const response = await this.fetch(url.toString(), {
      method: metodo,
      headers: {
        Cookie: sesion.cookie,
        'X-Bonita-API-Token': sesion.apiToken,
        ...(opciones.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: opciones.body !== undefined ? JSON.stringify(opciones.body) : undefined,
    });

    if (response.status === 401 && reintento) {
      this.logger.warn(`Sesion de Bonita del actor ${actor} vencida, reautenticando`);
      this.sesiones.delete(actor);
      return this.request<T>(actor, metodo, ruta, opciones, false);
    }

    const texto = await response.text();

    if (!response.ok) {
      throw new BonitaException(
        `Bonita respondio ${response.status} a ${metodo} ${ruta}: ${this.detalle(texto)}`,
        response.status,
      );
    }

    return (texto ? JSON.parse(texto) : undefined) as T;
  }

  /** fetch con timeout, traduciendo el motor inalcanzable a un 503 legible. */
  private async fetch(url: string, init: RequestInit): Promise<Response> {
    try {
      return await fetch(url, { ...init, signal: AbortSignal.timeout(this.timeoutMs) });
    } catch (error) {
      const motivo = error instanceof Error ? error.message : String(error);
      throw new BonitaException(`No se pudo contactar a Bonita en ${this.url}: ${motivo}`);
    }
  }

  /** Bonita devuelve los errores como { exception, message, explanations }. */
  private detalle(texto: string): string {
    try {
      const error = JSON.parse(texto) as { message?: string; explanations?: string[] };
      return [error.message, ...(error.explanations ?? [])].filter(Boolean).join(' - ');
    } catch {
      return texto.slice(0, 300);
    }
  }
}
