import { ConfigService } from '@nestjs/config';
import { BonitaProcesoService, TAREAS } from './bonita-proceso.service';
import { BonitaClient } from './bonita.client';

/**
 * Bonita simulado a nivel de fetch: se prueba el dialecto HTTP real (cookies,
 * token anti-CSRF, filtros, reintento de sesion, un usuario por actor) sin
 * levantar el motor.
 */
interface Llamada {
  metodo: string;
  url: URL;
  headers: Record<string, string>;
  body?: string;
}

const USUARIOS = {
  admin: { username: 'admin', password: 'bpm' },
  municipio: { username: 'april.sanchez', password: 'bpm' },
  coordinador: { username: 'anthony.nichols', password: 'bpm' },
  ong: { username: 'daniela.angelo', password: 'bpm' },
};

function respuesta(status: number, body?: unknown, setCookie: string[] = []): Response {
  const headers = new Headers();
  for (const c of setCookie) headers.append('Set-Cookie', c);
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers });
}

function crearServicio(overrides: Record<string, unknown> = {}) {
  const valores: Record<string, unknown> = {
    'bonita.enabled': true,
    'bonita.url': 'http://bonita:8080/bonita',
    'bonita.usuarios': USUARIOS,
    'bonita.processName': 'RescueSync',
    'bonita.timeoutMs': 1000,
    ...overrides,
  };
  const config = {
    get: (k: string, d?: unknown) => valores[k] ?? d,
    getOrThrow: (k: string) => valores[k],
  } as unknown as ConfigService;

  return new BonitaProcesoService(new BonitaClient(config), config);
}

/** Usuario de la sesion con que se hizo el request (JSESSIONID=<usuario>). */
function usuarioDe(llamada: Llamada): string | undefined {
  return /JSESSIONID=([^;]+)/.exec(llamada.headers.Cookie ?? '')?.[1];
}

describe('BonitaProcesoService', () => {
  let llamadas: Llamada[];
  let responder: (l: Llamada) => Response;

  beforeEach(() => {
    llamadas = [];
    jest.spyOn(global, 'fetch').mockImplementation((input, init) => {
      const llamada: Llamada = {
        metodo: init?.method ?? 'GET',
        url: new URL(String(input)),
        headers: (init?.headers ?? {}) as Record<string, string>,
        body: typeof init?.body === 'string' ? init.body : init?.body?.toString(),
      };
      llamadas.push(llamada);
      return Promise.resolve(responder(llamada));
    });
  });

  afterEach(() => jest.restoreAllMocks());

  /**
   * Motor con un caso que avanza segun las tareas que se ejecutan. Registra
   * quien ejecuto cada una, para verificar que se respeten los actores.
   */
  function motor() {
    const orden: string[] = [
      TAREAS.REGISTRAR_EMERGENCIA.nombre,
      TAREAS.GENERAR_LOTES.nombre,
      TAREAS.CARGAR_OFERTAS.nombre,
    ];
    let pendiente: string | null = null;
    const sesionesValidas = new Set<string>();
    const ejecutadas: { tarea: string; usuario?: string; contrato: unknown }[] = [];

    responder = (llamada) => {
      const { metodo, url } = llamada;
      const ruta = url.pathname.replace('/bonita', '');

      if (ruta === '/loginservice') {
        const usuario = new URLSearchParams(llamada.body).get('username')!;
        sesionesValidas.add(usuario);
        return respuesta(204, undefined, [
          `JSESSIONID=${usuario}; Path=/bonita; HttpOnly`,
          `X-Bonita-API-Token=tok-${usuario}; Path=/bonita`,
          'bonita.tenant=1; Path=/',
        ]);
      }

      const usuario = usuarioDe(llamada);
      if (!usuario || !sesionesValidas.has(usuario)) return respuesta(401);

      if (ruta === '/API/bpm/process') {
        return respuesta(200, [{ id: '77', name: 'RescueSync', version: '1.0' }]);
      }

      if (ruta === '/API/bpm/process/77/instantiation') {
        pendiente = orden[0];
        return respuesta(200, { caseId: 1001 });
      }

      if (ruta === '/API/bpm/humanTask') {
        const nombre = url.searchParams
          .getAll('f')
          .find((f) => f.startsWith('name='))
          ?.slice(5);
        return respuesta(
          200,
          nombre === pendiente ? [{ id: '5', name: nombre, state: 'ready' }] : [],
        );
      }

      if (metodo === 'POST' && ruta === '/API/bpm/userTask/5/execution') {
        ejecutadas.push({ tarea: pendiente!, usuario, contrato: JSON.parse(llamada.body!) });
        pendiente = orden[orden.indexOf(pendiente!) + 1] ?? null;
        return respuesta(204);
      }

      if (metodo === 'DELETE' && ruta === '/API/bpm/case/1001') return respuesta(200);

      return respuesta(404, { message: `sin ruta ${ruta}` });
    };

    return {
      ejecutadas,
      vencerSesiones: () => sesionesValidas.clear(),
      vencerTimer: () => (pendiente = null),
    };
  }

  it('el municipio inicia el caso y completa "Registrar emergencia" con el id', async () => {
    const bonita = motor();
    const caseId = await crearServicio().iniciarCaso(42);

    expect(caseId).toBe('1001');
    expect(bonita.ejecutadas).toEqual([
      { tarea: 'Registrar emergencia', usuario: 'april.sanchez', contrato: { id: 42 } },
    ]);

    const login = llamadas[0];
    expect(login.url.pathname).toBe('/bonita/loginservice');
    expect(login.body).toContain('redirect=false');

    const ejecucion = llamadas.find((l) => l.url.pathname.endsWith('/execution'))!;
    expect(ejecucion.url.searchParams.get('assign')).toBe('true');
    // CSRF y sesion en cada request autenticado
    expect(ejecucion.headers['X-Bonita-API-Token']).toBe('tok-april.sanchez');
    expect(ejecucion.headers.Cookie).toBe(
      'JSESSIONID=april.sanchez; X-Bonita-API-Token=tok-april.sanchez; bonita.tenant=1',
    );
  });

  it('publicar lo completa el coordinador y deja el caso en "Cargar / editar ofertas"', async () => {
    const bonita = motor();
    const servicio = crearServicio();
    const caseId = (await servicio.iniciarCaso(42))!;

    await servicio.publicarConvocatoria(caseId);

    expect(bonita.ejecutadas.map((e) => [e.tarea, e.usuario])).toEqual([
      ['Registrar emergencia', 'april.sanchez'],
      ['Generar lotes', 'anthony.nichols'],
    ]);
  });

  it('cerrar antes del timer completa la tarea de la ONG; despues del timer no toca el motor', async () => {
    const bonita = motor();
    const servicio = crearServicio();
    const caseId = (await servicio.iniciarCaso(42))!;
    await servicio.publicarConvocatoria(caseId);

    await servicio.cerrarConvocatoria(caseId);
    expect(bonita.ejecutadas[2]).toMatchObject({
      tarea: 'Cargar / editar ofertas',
      usuario: 'daniela.angelo',
    });

    bonita.vencerTimer();
    await servicio.cerrarConvocatoria(caseId);
    expect(bonita.ejecutadas).toHaveLength(3);
  });

  it('reabre la sesion una vez si Bonita responde 401', async () => {
    const bonita = motor();
    const servicio = crearServicio();
    await servicio.iniciarCaso(42);

    bonita.vencerSesiones();
    await servicio.cancelarCaso('1001');

    const logins = llamadas.filter((l) => l.url.pathname === '/bonita/loginservice');
    expect(logins).toHaveLength(3);
  });

  it('con la integracion apagada no hace ningun request', async () => {
    motor();
    const servicio = crearServicio({ 'bonita.enabled': false });

    expect(await servicio.iniciarCaso(42)).toBeNull();
    await servicio.publicarConvocatoria('1');
    await servicio.cerrarConvocatoria('1');
    await servicio.cancelarCaso('1');

    expect(llamadas).toHaveLength(0);
  });

  it('login rechazado se traduce a 503', async () => {
    responder = () => respuesta(401);
    await expect(crearServicio().iniciarCaso(42)).rejects.toMatchObject({ status: 503 });
  });
});
