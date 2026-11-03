import { createServer, Server } from 'http';
import { AddressInfo } from 'net';
import request from 'supertest';
import { BASE, comoUsuario, login } from './helpers/auth';
import { ID_MUNICIPIO, ORG_MUNICIPIO, ORG_ONG, ORG_RESCATE, resetearEstado } from './helpers/db';
import { cerrarApp, crearAppDeTest, TestContext } from './helpers/test-app';

/** Sistema Nacional de mentira: guarda los requests y responde como el real. */
function sistemaNacionalFalso() {
  const pedidos: { metodo?: string; url?: string; auth?: string; body: string }[] = [];

  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (parte) => (body += parte));
    req.on('end', () => {
      pedidos.push({ metodo: req.method, url: req.url, auth: req.headers.authorization, body });
      res.setHeader('Content-Type', 'application/json');

      if (req.url?.endsWith('/auth/login')) {
        res.end(JSON.stringify({ accessToken: 'token-falso' }));
        return;
      }

      if (req.method === 'PUT' && body.includes('"cantidadTotal":1')) {
        res.statusCode = 409;
        res.end(JSON.stringify({ message: 'No se puede reducir el inventario' }));
        return;
      }

      res.end(JSON.stringify({ codigoNacional: 'ONG-0001', recursos: [] }));
    });
  });

  return { server, pedidos };
}

describe('Notificaciones, inventario e indicadores (e2e)', () => {
  let ctx: TestContext;
  let nacional: ReturnType<typeof sistemaNacionalFalso>;
  let tokenOng: string;
  let tokenMunicipio: string;
  let tokenCoordinador: string;
  let tokenAuditor: string;

  beforeAll(async () => {
    nacional = sistemaNacionalFalso();
    await new Promise<void>((resolve) => nacional.server.listen(0, resolve));
    const { port } = nacional.server.address() as AddressInfo;
    process.env.SISTEMA_NACIONAL_URL = `http://localhost:${port}`;
    process.env.SISTEMA_NACIONAL_PASSWORD = 'clave-de-test';

    ctx = await crearAppDeTest();
  });

  beforeEach(async () => {
    await resetearEstado(ctx);
    nacional.pedidos.length = 0;
    tokenOng = (await login(ctx.app, 'ong@test.ar')).accessToken;
    tokenMunicipio = (await login(ctx.app, 'municipio@test.ar')).accessToken;
    tokenCoordinador = (await login(ctx.app, 'coordinador@test.ar')).accessToken;
    tokenAuditor = (await login(ctx.app, 'auditor@test.ar')).accessToken;
  });

  afterAll(async () => {
    await cerrarApp(ctx);
    // Sin esto, las conexiones keep-alive del cliente dejan colgado el close.
    (nacional.server as Server).closeAllConnections();
    await new Promise((resolve) => (nacional.server as Server).close(resolve));
  });

  const http = () => request(ctx.app.getHttpServer());

  const sembrarEmergencia = (estado: 'REGISTRADA' | 'EN_ADJUDICACION') =>
    ctx.prisma.emergencia.create({
      data: {
        tipo: 'INUNDACION',
        gravedad: 'ALTA',
        zonaAfectada: 'Barrio Costanera',
        descripcion: 'Crecida del rio con viviendas anegadas.',
        fechaOcurrencia: new Date('2026-09-20T10:00:00.000Z'),
        estado,
        municipioId: ORG_MUNICIPIO,
        registradaPorId: ID_MUNICIPIO,
        lotes: {
          create: {
            categoria: 'PERSONAL',
            descripcion: 'Paramedicos',
            cantidadRequerida: 5,
            unidad: 'personas',
          },
        },
      },
      include: { lotes: true },
    });

  /** Oferta validada en consorcio entre la ONG y los bomberos. */
  const sembrarOfertaValidada = async () => {
    const emergencia = await sembrarEmergencia('EN_ADJUDICACION');
    return ctx.prisma.oferta.create({
      data: {
        emergenciaId: emergencia.id,
        estado: 'VALIDADA',
        organizacionLiderId: ORG_ONG,
        presentadaPorId: 3,
        participantes: {
          create: [
            { organizacionId: ORG_ONG, esLider: true },
            { organizacionId: ORG_RESCATE, esLider: false },
          ],
        },
        lineas: {
          create: { loteId: emergencia.lotes[0].id, organizacionId: ORG_ONG, cantidad: 3 },
        },
      },
    });
  };

  describe('notificaciones', () => {
    it('publicar la convocatoria avisa a las ONGs y organismos de la red, no a los municipios', async () => {
      const emergencia = await sembrarEmergencia('REGISTRADA');

      await http()
        .post(`${BASE}/emergencias/${emergencia.id}/publicar-convocatoria`)
        .set('Authorization', comoUsuario(tokenCoordinador))
        .send({ fechaCierreConvocatoria: new Date(Date.now() + 86_400_000).toISOString() })
        .expect((res) => expect(res.status).toBeLessThan(300));

      const filas = await ctx.prisma.notificacion.findMany({ orderBy: { organizacionId: 'asc' } });
      expect(filas.map((f) => f.organizacionId)).toEqual([ORG_ONG, ORG_RESCATE]);

      const res = await http()
        .get(`${BASE}/notificaciones`)
        .set('Authorization', comoUsuario(tokenOng))
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({ tipo: 'CONVOCATORIA_ABIERTA', leida: false });
      expect(res.body[0].mensaje).toContain('Barrio Costanera');
    });

    it('adjudicar notifica a todos los integrantes del consorcio', async () => {
      const oferta = await sembrarOfertaValidada();

      await http()
        .post(`${BASE}/ofertas/${oferta.id}/adjudicar`)
        .set('Authorization', comoUsuario(tokenMunicipio))
        .expect(200);

      const filas = await ctx.prisma.notificacion.findMany();
      expect(filas).toHaveLength(2);
      expect(filas.every((f) => f.tipo === 'OFERTA_ADJUDICADA')).toBe(true);
    });

    it('no adjudicar tambien se notifica', async () => {
      const oferta = await sembrarOfertaValidada();

      await http()
        .post(`${BASE}/ofertas/${oferta.id}/rechazar`)
        .set('Authorization', comoUsuario(tokenMunicipio))
        .send({ motivo: 'Se eligio otra propuesta' })
        .expect(200);

      const filas = await ctx.prisma.notificacion.findMany();
      expect(filas.every((f) => f.tipo === 'OFERTA_NO_ADJUDICADA')).toBe(true);
    });

    it('marca como leida solo las de la propia organizacion', async () => {
      const emergencia = await sembrarEmergencia('REGISTRADA');
      const propia = await ctx.prisma.notificacion.create({
        data: {
          organizacionId: ORG_ONG,
          emergenciaId: emergencia.id,
          tipo: 'OFERTA_ADJUDICADA',
          mensaje: 'propia',
        },
      });
      const ajena = await ctx.prisma.notificacion.create({
        data: {
          organizacionId: ORG_RESCATE,
          emergenciaId: emergencia.id,
          tipo: 'OFERTA_ADJUDICADA',
          mensaje: 'ajena',
        },
      });

      const res = await http()
        .post(`${BASE}/notificaciones/${propia.id}/leida`)
        .set('Authorization', comoUsuario(tokenOng))
        .expect(200);
      expect(res.body.leida).toBe(true);

      await http()
        .post(`${BASE}/notificaciones/${ajena.id}/leida`)
        .set('Authorization', comoUsuario(tokenOng))
        .expect(404);
    });

    it('otros perfiles no acceden', async () => {
      await http()
        .get(`${BASE}/notificaciones`)
        .set('Authorization', comoUsuario(tokenAuditor))
        .expect(403);
    });
  });

  describe('inventario', () => {
    const conCodigo = () =>
      ctx.prisma.organizacion.update({
        where: { id: ORG_ONG },
        data: { codigoNacional: 'ONG-0001' },
      });

    it('consulta al Sistema Nacional con la cuenta de servicio y el codigo de la organizacion', async () => {
      await conCodigo();

      const res = await http()
        .get(`${BASE}/inventario`)
        .set('Authorization', comoUsuario(tokenOng))
        .expect(200);

      expect(res.body.codigoNacional).toBe('ONG-0001');

      const pedido = nacional.pedidos.find((p) => p.url?.includes('/recursos'));
      expect(pedido).toMatchObject({
        metodo: 'GET',
        url: '/organizaciones/ONG-0001/recursos',
        auth: 'Bearer token-falso',
      });
    });

    it('reenvia la actualizacion', async () => {
      await conCodigo();

      await http()
        .put(`${BASE}/inventario`)
        .set('Authorization', comoUsuario(tokenOng))
        .send({ recursos: [{ categoria: 'PERSONAL', unidad: 'personas', cantidadTotal: 20 }] })
        .expect(200);

      const pedido = nacional.pedidos.find((p) => p.metodo === 'PUT');
      expect(JSON.parse(pedido!.body)).toEqual({
        recursos: [{ categoria: 'PERSONAL', unidad: 'personas', cantidadTotal: 20 }],
      });
    });

    it('devuelve el error de negocio del Sistema Nacional', async () => {
      await conCodigo();

      const res = await http()
        .put(`${BASE}/inventario`)
        .set('Authorization', comoUsuario(tokenOng))
        .send({ recursos: [{ categoria: 'PERSONAL', unidad: 'personas', cantidadTotal: 1 }] })
        .expect(400);

      expect(res.body.message).toContain('No se puede reducir el inventario');
    });

    it('sin codigo nacional responde 400 y no llama al Sistema Nacional', async () => {
      await http()
        .get(`${BASE}/inventario`)
        .set('Authorization', comoUsuario(tokenOng))
        .expect(400);

      expect(nacional.pedidos).toHaveLength(0);
    });

    it('es solo para el Representante de ONG', async () => {
      await http()
        .get(`${BASE}/inventario`)
        .set('Authorization', comoUsuario(tokenMunicipio))
        .expect(403);
    });
  });

  describe('consolidado', () => {
    it('incluye gravedad y categoria, que necesita el Sistema Nacional', async () => {
      const oferta = await sembrarOfertaValidada();

      const res = await http()
        .get(`${BASE}/emergencias/${oferta.emergenciaId}/ofertas/consolidado`)
        .set('Authorization', comoUsuario(tokenCoordinador))
        .expect(200);

      expect(res.body.gravedad).toBe('ALTA');
      expect(res.body.ofertas[0].lineas[0].categoria).toBe('PERSONAL');
    });
  });

  describe('compromisos para el Sistema Nacional', () => {
    const TOKEN_SERVICIO = () => process.env.BONITA_CALLBACK_TOKEN!;

    const compromisos = (emergenciaId: number) =>
      http()
        .get(`${BASE}/emergencias/${emergenciaId}/ofertas/compromisos`)
        .set('X-Service-Token', TOKEN_SERVICIO());

    /** Dos lotes, y una oferta adjudicada en la que cada ONG aporta lo suyo. */
    const sembrarAdjudicada = async (estado: 'ADJUDICADA' | 'VALIDADA' = 'ADJUDICADA') => {
      await ctx.prisma.organizacion.update({
        where: { id: ORG_ONG },
        data: { codigoNacional: 'ONG-0001' },
      });
      await ctx.prisma.organizacion.update({
        where: { id: ORG_RESCATE },
        data: { codigoNacional: 'ORG-0002' },
      });
      const emergencia = await sembrarEmergencia('EN_ADJUDICACION');
      const raciones = await ctx.prisma.lote.create({
        data: {
          emergenciaId: emergencia.id,
          categoria: 'ALIMENTOS',
          descripcion: 'Raciones',
          cantidadRequerida: 100,
          unidad: 'raciones',
        },
      });
      const segundoPersonal = await ctx.prisma.lote.create({
        data: {
          emergenciaId: emergencia.id,
          categoria: 'PERSONAL',
          descripcion: 'Rescatistas',
          cantidadRequerida: 4,
          unidad: 'personas',
        },
      });

      await ctx.prisma.oferta.create({
        data: {
          emergenciaId: emergencia.id,
          estado,
          organizacionLiderId: ORG_ONG,
          presentadaPorId: 3,
          participantes: {
            create: [
              { organizacionId: ORG_ONG, esLider: true },
              { organizacionId: ORG_RESCATE, esLider: false },
            ],
          },
          lineas: {
            create: [
              { loteId: emergencia.lotes[0].id, organizacionId: ORG_ONG, cantidad: 3 },
              { loteId: segundoPersonal.id, organizacionId: ORG_ONG, cantidad: 1 },
              { loteId: raciones.id, organizacionId: ORG_ONG, cantidad: 100 },
              { loteId: emergencia.lotes[0].id, organizacionId: ORG_RESCATE, cantidad: 2 },
            ],
          },
        },
      });

      return emergencia;
    };

    it('agrupa por ONG y categoria, con la forma que pide el Sistema Nacional', async () => {
      const emergencia = await sembrarAdjudicada();

      const res = await compromisos(emergencia.id).expect(200);

      expect(res.body.gravedad).toBe('ALTA');
      expect(res.body.compromisos).toHaveLength(2);
      expect(res.body.compromisos).toEqual(
        expect.arrayContaining([
          {
            codigoNacional: 'ONG-0001',
            items: expect.arrayContaining([
              { categoria: 'PERSONAL', cantidad: 4 },
              { categoria: 'ALIMENTOS', cantidad: 100 },
            ]),
          },
          { codigoNacional: 'ORG-0002', items: [{ categoria: 'PERSONAL', cantidad: 2 }] },
        ]),
      );
    });

    it('no incluye lo que no se adjudico: sin ofertas adjudicadas responde 400', async () => {
      const emergencia = await sembrarAdjudicada('VALIDADA');

      const res = await compromisos(emergencia.id).expect(400);
      expect(res.body.message).toContain('no tiene ofertas adjudicadas');
    });

    it('una ONG sin codigo nacional no se puede comprometer', async () => {
      const emergencia = await sembrarAdjudicada();
      await ctx.prisma.organizacion.update({
        where: { id: ORG_RESCATE },
        data: { codigoNacional: null },
      });

      const res = await compromisos(emergencia.id).expect(400);
      expect(res.body.message).toContain('no tiene codigo nacional');
    });

    it('la ONG no accede', async () => {
      const emergencia = await sembrarAdjudicada();

      await http()
        .get(`${BASE}/emergencias/${emergencia.id}/ofertas/compromisos`)
        .set('Authorization', comoUsuario(tokenOng))
        .expect(403);
    });
  });

  describe('indicadores', () => {
    it('calcula suministros del mes, consorcios y estado de los proyectos', async () => {
      const oferta = await sembrarOfertaValidada();

      await http()
        .post(`${BASE}/ofertas/${oferta.id}/adjudicar`)
        .set('Authorization', comoUsuario(tokenMunicipio))
        .expect(200);

      const mes = new Date().toISOString().slice(0, 7);

      const res = await http()
        .get(`${BASE}/indicadores?mes=${mes}`)
        .set('Authorization', comoUsuario(tokenAuditor))
        .expect(200);

      expect(res.body).toEqual({
        mes,
        suministrosMovilizados: [{ categoria: 'PERSONAL', unidad: 'personas', cantidad: 3 }],
        consorcios: { ofertasAdjudicadas: 1, enConsorcio: 1, porcentaje: 100 },
        proyectos: {
          total: 1,
          finalizados: 0,
          porEstado: [{ estado: 'EN_ADJUDICACION', cantidad: 1 }],
        },
        // Con Bonita apagado el tablero sigue funcionando sin los tiempos.
        tiemposPorEtapa: { disponible: false, etapas: [] },
      });
    });

    it('un mes sin adjudicaciones no suma suministros', async () => {
      const oferta = await sembrarOfertaValidada();

      await http()
        .post(`${BASE}/ofertas/${oferta.id}/adjudicar`)
        .set('Authorization', comoUsuario(tokenMunicipio))
        .expect(200);

      const res = await http()
        .get(`${BASE}/indicadores?mes=2020-01`)
        .set('Authorization', comoUsuario(tokenAuditor))
        .expect(200);

      expect(res.body.suministrosMovilizados).toEqual([]);
    });

    it('rechaza un mes mal formado', async () => {
      await http()
        .get(`${BASE}/indicadores?mes=noviembre`)
        .set('Authorization', comoUsuario(tokenAuditor))
        .expect(400);
    });

    it('es solo para el Auditor', async () => {
      await http()
        .get(`${BASE}/indicadores`)
        .set('Authorization', comoUsuario(tokenCoordinador))
        .expect(403);
    });
  });
});
