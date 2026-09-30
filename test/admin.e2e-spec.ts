import * as bcrypt from 'bcryptjs';
import { EstadoEmergencia, Rol } from '@prisma/client';
import request from 'supertest';
import { BASE, comoUsuario, login } from './helpers/auth';
import { ID_MUNICIPIO, ORG_MUNICIPIO, PASSWORD_TEST, resetearEstado } from './helpers/db';
import { cerrarApp, crearAppDeTest, TestContext } from './helpers/test-app';

/**
 * Superusuario de desarrollo: pasa los chequeos de rol y de pertenencia, pero
 * no puede hacer lo que exige tener organizacion.
 */
describe('ADMIN (e2e)', () => {
  let ctx: TestContext;
  let tokenAdmin: string;
  let tokenCoordinador: string;

  beforeAll(async () => {
    ctx = await crearAppDeTest();
  });

  beforeEach(async () => {
    await resetearEstado(ctx);
    await ctx.prisma.usuario.create({
      data: {
        email: 'admin@test.ar',
        nombreCompleto: 'Admin de pruebas',
        rol: Rol.ADMIN,
        password: await bcrypt.hash(PASSWORD_TEST, 4),
      },
    });
    tokenAdmin = (await login(ctx.app, 'admin@test.ar')).accessToken;
    tokenCoordinador = (await login(ctx.app, 'coordinador@test.ar')).accessToken;
  });

  afterAll(async () => {
    await cerrarApp(ctx);
  });

  const http = () => request(ctx.app.getHttpServer());

  const sembrarEmergencia = (estado: EstadoEmergencia) =>
    ctx.prisma.emergencia.create({
      data: {
        tipo: 'INCENDIO',
        gravedad: 'CRITICA',
        zonaAfectada: 'Sierras del oeste',
        descripcion: 'Foco activo sobre ladera norte, avance sostenido por viento.',
        fechaOcurrencia: new Date('2026-09-20T10:00:00.000Z'),
        estado,
        municipioId: ORG_MUNICIPIO,
        registradaPorId: ID_MUNICIPIO,
      },
    });

  it('entra a endpoints restringidos a otros perfiles', async () => {
    await http().get(`${BASE}/usuarios`).set('Authorization', comoUsuario(tokenAdmin)).expect(200);
  });

  it('ejecuta transiciones de coordinador y de municipio duenio', async () => {
    const emergencia = await sembrarEmergencia(EstadoEmergencia.REGISTRADA);
    await ctx.prisma.lote.create({
      data: {
        emergenciaId: emergencia.id,
        categoria: 'PERSONAL',
        descripcion: 'Paramedicos con experiencia en rescate',
        cantidadRequerida: 5,
        unidad: 'personas',
      },
    });

    const transicion = (accion: string, body: object = {}) =>
      http()
        .post(`${BASE}/emergencias/${emergencia.id}/${accion}`)
        .set('Authorization', comoUsuario(tokenAdmin))
        .send(body)
        .expect(200);

    const enUnaSemana = new Date(Date.now() + 7 * 86400 * 1000).toISOString();

    await transicion('publicar-convocatoria', { fechaCierreConvocatoria: enUnaSemana });
    await transicion('cerrar-convocatoria');
    await transicion('habilitar-adjudicacion');
    // Solo lo puede hacer el municipio duenio; el ADMIN no pertenece a ninguno
    const res = await transicion('adjudicar');

    expect(res.body.estado).toBe(EstadoEmergencia.EN_EJECUCION);
  });

  it('no puede registrar emergencias: eso exige pertenecer a un municipio', async () => {
    await http()
      .post(`${BASE}/emergencias`)
      .set('Authorization', comoUsuario(tokenAdmin))
      .send({
        tipo: 'INUNDACION',
        gravedad: 'ALTA',
        zonaAfectada: 'Barrio Costanera',
        descripcion: 'Crecida del rio tras 48 horas de lluvias en la ribera.',
        fechaOcurrencia: '2026-09-22T14:30:00.000Z',
      })
      .expect(403);
  });

  it('no se puede dar de alta por la API', async () => {
    await http()
      .post(`${BASE}/usuarios`)
      .set('Authorization', comoUsuario(tokenCoordinador))
      .send({
        email: 'otro.admin@test.ar',
        password: 'Rescue2026!',
        nombreCompleto: 'Otro admin',
        rol: 'ADMIN',
      })
      .expect(400);
  });
});
