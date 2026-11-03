import { HttpException, HttpStatus, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface RecursoNacional {
  categoria: string;
  unidad: string;
  cantidadTotal: number;
  cantidadComprometida: number;
  disponible: number;
}

export interface InventarioNacional {
  codigoNacional: string;
  recursos: RecursoNacional[];
}

export interface RecursoInput {
  categoria: string;
  unidad: string;
  cantidadTotal: number;
}

/**
 * Cliente del Sistema Nacional, con la cuenta de servicio de la app web. Solo
 * cubre el inventario: validar, comprometer y liberar los invoca Bonita.
 */
@Injectable()
export class SistemaNacionalClient {
  private readonly url: string;
  private readonly email: string;
  private readonly password: string;
  private readonly timeoutMs: number;

  private token: string | null = null;

  constructor(config: ConfigService) {
    this.url = config.getOrThrow<string>('sistemaNacional.url');
    this.email = config.getOrThrow<string>('sistemaNacional.email');
    this.password = config.getOrThrow<string>('sistemaNacional.password');
    this.timeoutMs = config.get<number>('sistemaNacional.timeoutMs', 10000);
  }

  obtenerInventario(codigo: string): Promise<InventarioNacional> {
    return this.request('GET', `/organizaciones/${encodeURIComponent(codigo)}/recursos`);
  }

  actualizarInventario(codigo: string, recursos: RecursoInput[]): Promise<InventarioNacional> {
    return this.request('PUT', `/organizaciones/${encodeURIComponent(codigo)}/recursos`, {
      recursos,
    });
  }

  /** El token vence: ante un 401 se pide otro y se reintenta una vez. */
  private async request<T>(
    metodo: string,
    ruta: string,
    body?: unknown,
    reintento = true,
  ): Promise<T> {
    this.token ??= await this.login();

    const response = await this.fetch(`${this.url}${ruta}`, {
      method: metodo,
      headers: {
        Authorization: `Bearer ${this.token}`,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (response.status === 401 && reintento) {
      this.token = null;
      return this.request<T>(metodo, ruta, body, false);
    }

    const datos = (await response.json().catch(() => ({}))) as { message?: string | string[] };

    if (response.status >= 500 || response.status === 401) {
      throw new ServiceUnavailableException(
        `El Sistema Nacional respondio ${response.status} a ${metodo} ${ruta}`,
      );
    }

    // Los errores de negocio (por ejemplo, bajar el total por debajo de lo
    // comprometido) le sirven tal cual al usuario.
    if (!response.ok) {
      throw new HttpException(
        datos.message ?? 'El Sistema Nacional rechazo la operacion',
        response.status === HttpStatus.NOT_FOUND ? HttpStatus.NOT_FOUND : HttpStatus.BAD_REQUEST,
      );
    }

    return datos as T;
  }

  private async login(): Promise<string> {
    const response = await this.fetch(`${this.url}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: this.email, password: this.password }),
    });

    if (!response.ok) {
      throw new ServiceUnavailableException(
        `El Sistema Nacional rechazo el login de ${this.email} (HTTP ${response.status})`,
      );
    }

    const { accessToken } = (await response.json()) as { accessToken: string };
    return accessToken;
  }

  private async fetch(url: string, init: RequestInit): Promise<Response> {
    try {
      return await fetch(url, { ...init, signal: AbortSignal.timeout(this.timeoutMs) });
    } catch {
      throw new ServiceUnavailableException(`No se pudo contactar al Sistema Nacional en ${url}`);
    }
  }
}
