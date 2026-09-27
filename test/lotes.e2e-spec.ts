import { EstadoEmergencia } from '@prisma/client';
import request from 'supertest';
import { BASE, comoUsuario, login } from './helpers/auth';
import { ID_MUNICIPIO, ORG_MUNICIPIO, resetearEstado } from './helpers/db';
import { cerrarApp, crearAppDeTest, TestContext } from './helpers/test-app';

describe('Lotes (e2e)', () => {
  let ctx: TestContext;
  let tokenMunicipio: string;
  let tokenCoordinador: string;
  let tokenOng: string;
  let tokenAuditor: string;

  beforeAll(async () => {
    ctx = await crearAppDeTest();
  });

  beforeEach(async () => {
    await resetearEstado(ctx);
    tokenMunicipio = (await login(ctx.app, 'municipio@test.ar')).accessToken;
    tokenCoordinador = (await login(ctx.app, 'coordinador@test.ar')).accessToken;
    tokenOng = (await login(ctx.app, 'ong@test.ar')).accessToken;
    tokenAuditor = (await login(ctx.app, 'auditor@test.ar')).accessToken;
  });

  afterAll(async () => {
    await cerrarApp(ctx);
  });

  const sembrarEmergencia = (
    estado: EstadoEmergencia = EstadoEmergencia.REGISTRADA,
    municipioId = ORG_MUNICIPIO,
  ) =>
    ctx.prisma.emergencia.create({
      data: {
        tipo: 'INUNDACION',
        gravedad: 'ALTA',
        zonaAfectada: 'Barrio Costanera',
        descripcion: 'Crecida del rio con viviendas anegadas en toda la ribera sur.',
        fechaOcurrencia: new Date('2026-09-20T10:00:00.000Z'),
        estado,
        municipioId,
        registradaPorId: ID_MUNICIPIO,
      },
    });

  const nuevoLote = {
    categoria: 'PERSONAL',
    descripcion: 'Paramedicos con experiencia en rescate acuatico',
    cantidadRequerida: 5,
    unidad: 'personas',
  };

  const url = (emergenciaId: number, sufijo = '') =>
    `${BASE}/emergencias/${emergenciaId}/lotes${sufijo}`;

  const crearLote = (emergenciaId: number, token: string, body: object = nuevoLote) =>
    request(ctx.app.getHttpServer())
      .post(url(emergenciaId))
      .set('Authorization', comoUsuario(token))
      .send(body);

  // ------------------------------------------------------------------

  describe('POST lotes', () => {
    it('el coordinador desglosa la emergencia en lotes', async () => {
      const emergencia = await sembrarEmergencia();

      const res = await crearLote(emergencia.id, tokenCoordinador).expect(201);

      expect(res.body).toMatchObject({
        emergenciaId: emergencia.id,
        categoria: 'PERSONAL',
        cantidadRequerida: 5,
        unidad: 'personas',
        cantidadCubierta: 0,
        porcentajeCobertura: 0,
        cubierto: false,
      });
    });

    it('admite varios lotes de distintas categorias', async () => {
      const emergencia = await sembrarEmergencia();

      await crearLote(emergencia.id, tokenCoordinador).expect(201);
      await crearLote(emergencia.id, tokenCoordinador, {
        categoria: 'ALIMENTOS',
        descripcion: 'Raciones de comida no perecedera',
        cantidadRequerida: 1000,
        unidad: 'raciones',
      }).expect(201);

      const res = await request(ctx.app.getHttpServer())
        .get(url(emergencia.id))
        .set('Authorization', comoUsuario(tokenCoordinador))
        .expect(200);

      expect(res.body).toHaveLength(2);
    });

    /**
     * Dos lotes con la misma descripcion en una emergencia son casi siempre
     * un error de carga: o son necesidades distintas mal nombradas, o es la
     * misma y hay que sumar la cantidad.
     */
    it('rechaza dos lotes con la misma descripcion en la misma emergencia', async () => {
      const emergencia = await sembrarEmergencia();

      await crearLote(emergencia.id, tokenCoordinador).expect(201);

      const res = await crearLote(emergencia.id, tokenCoordinador).expect(400);
      expect(res.body.message).toContain('Ya hay un lote con esa descripcion');
    });

    it('la misma descripcion si vale en otra emergencia', async () => {
      const una = await sembrarEmergencia();
      const otra = await sembrarEmergencia();

      await crearLote(una.id, tokenCoordinador).expect(201);
      await crearLote(otra.id, tokenCoordinador).expect(201);
    });

    it.each([
      ['municipio', () => tokenMunicipio],
      ['ong', () => tokenOng],
      ['auditor', () => tokenAuditor],
    ])('un %s no puede cargar lotes', async (_perfil, token) => {
      const emergencia = await sembrarEmergencia();
      await crearLote(emergencia.id, token()).expect(403);
    });

    it.each([
      ['categoria inexistente', { categoria: 'HELICOPTEROS' }],
      ['cantidad cero', { cantidadRequerida: 0 }],
      ['cantidad negativa', { cantidadRequerida: -3 }],
      ['cantidad no numerica', { cantidadRequerida: 'muchos' }],
      ['descripcion muy corta', { descripcion: 'abc' }],
      ['unidad vacia', { unidad: '' }],
    ])('rechaza con 400: %s', async (_caso, sobrescribe) => {
      const emergencia = await sembrarEmergencia();
      await crearLote(emergencia.id, tokenCoordinador, { ...nuevoLote, ...sobrescribe }).expect(
        400,
      );
    });

    it('devuelve 404 si la emergencia no existe', async () => {
      await crearLote(99999, tokenCoordinador).expect(404);
    });
  });

  // ------------------------------------------------------------------

  describe('Estados en los que se pueden tocar los lotes', () => {
    it('se pueden cargar con la emergencia REGISTRADA', async () => {
      const emergencia = await sembrarEmergencia(EstadoEmergencia.REGISTRADA);
      await crearLote(emergencia.id, tokenCoordinador).expect(201);
    });

    /**
     * La consigna lo pide: cuando vence el temporizador sin cobertura
     * completa, una de las salidas del Coordinador es "reformular lotes".
     */
    it('se pueden reformular con la convocatoria CERRADA', async () => {
      const emergencia = await sembrarEmergencia(EstadoEmergencia.CONVOCATORIA_CERRADA);
      await crearLote(emergencia.id, tokenCoordinador).expect(201);
    });

    /**
     * Con la convocatoria abierta las ONGs estan ofertando sobre estos lotes
     * en ese preciso momento: cambiar una cantidad debajo de una oferta en
     * curso la invalidaria sin que nadie se entere.
     */
    it.each([['CONVOCATORIA_ABIERTA'], ['EN_ADJUDICACION'], ['EN_EJECUCION'], ['FINALIZADA']])(
      'no se pueden tocar en estado %s',
      async (estado) => {
        const emergencia = await sembrarEmergencia(estado as EstadoEmergencia);

        const res = await crearLote(emergencia.id, tokenCoordinador).expect(400);
        expect(res.body.message).toContain('No se pueden modificar los lotes');
      },
    );
  });

  // ------------------------------------------------------------------

  describe('GET lotes', () => {
    it('devuelve la lista vacia si todavia no hay desglose', async () => {
      const emergencia = await sembrarEmergencia();

      const res = await request(ctx.app.getHttpServer())
        .get(url(emergencia.id))
        .set('Authorization', comoUsuario(tokenCoordinador))
        .expect(200);

      expect(res.body).toEqual([]);
    });

    it('la ONG ve los lotes de una convocatoria publicada', async () => {
      const emergencia = await sembrarEmergencia();
      await crearLote(emergencia.id, tokenCoordinador).expect(201);
      await ctx.prisma.emergencia.update({
        where: { id: emergencia.id },
        data: { estado: EstadoEmergencia.CONVOCATORIA_ABIERTA },
      });

      const res = await request(ctx.app.getHttpServer())
        .get(url(emergencia.id))
        .set('Authorization', comoUsuario(tokenOng))
        .expect(200);

      expect(res.body).toHaveLength(1);
    });

    /**
     * El control de acceso se delega en la emergencia: si el usuario no la
     * puede ver, tampoco sus lotes. Por eso es 404 y no 403.
     */
    it('la ONG no ve los lotes de una emergencia aun no publicada', async () => {
      const emergencia = await sembrarEmergencia(EstadoEmergencia.REGISTRADA);
      await crearLote(emergencia.id, tokenCoordinador).expect(201);

      await request(ctx.app.getHttpServer())
        .get(url(emergencia.id))
        .set('Authorization', comoUsuario(tokenOng))
        .expect(404);
    });

    it('un municipio no ve los lotes de la emergencia de otro', async () => {
      const otro = await ctx.prisma.organizacion.create({
        data: { nombre: 'Municipalidad Vecina', tipo: 'MUNICIPIO' },
      });
      const ajena = await sembrarEmergencia(EstadoEmergencia.REGISTRADA, otro.id);

      await request(ctx.app.getHttpServer())
        .get(url(ajena.id))
        .set('Authorization', comoUsuario(tokenMunicipio))
        .expect(404);
    });

    it('el municipio duenio si los ve', async () => {
      const emergencia = await sembrarEmergencia();
      await crearLote(emergencia.id, tokenCoordinador).expect(201);

      await request(ctx.app.getHttpServer())
        .get(url(emergencia.id))
        .set('Authorization', comoUsuario(tokenMunicipio))
        .expect(200);
    });
  });

  // ------------------------------------------------------------------

  describe('PUT y DELETE', () => {
    it('reformula un lote', async () => {
      const emergencia = await sembrarEmergencia();
      const creado = await crearLote(emergencia.id, tokenCoordinador).expect(201);

      const res = await request(ctx.app.getHttpServer())
        .put(url(emergencia.id, `/${creado.body.id}`))
        .set('Authorization', comoUsuario(tokenCoordinador))
        .send({ ...nuevoLote, cantidadRequerida: 12 })
        .expect(200);

      expect(res.body.cantidadRequerida).toBe(12);
    });

    it('borra un lote del desglose', async () => {
      const emergencia = await sembrarEmergencia();
      const creado = await crearLote(emergencia.id, tokenCoordinador).expect(201);

      await request(ctx.app.getHttpServer())
        .delete(url(emergencia.id, `/${creado.body.id}`))
        .set('Authorization', comoUsuario(tokenCoordinador))
        .expect(204);

      const res = await request(ctx.app.getHttpServer())
        .get(url(emergencia.id))
        .set('Authorization', comoUsuario(tokenCoordinador))
        .expect(200);

      expect(res.body).toEqual([]);
    });

    /**
     * Sin esta verificacion, /emergencias/1/lotes/99 editaria el lote 99
     * aunque sea de otra emergencia: la ruta anidada seria decorativa y el
     * control de acceso sobre la emergencia, inutil.
     */
    it('no deja tocar un lote a traves de otra emergencia', async () => {
      const una = await sembrarEmergencia();
      const otra = await sembrarEmergencia();
      const loteDeUna = await crearLote(una.id, tokenCoordinador).expect(201);

      await request(ctx.app.getHttpServer())
        .put(url(otra.id, `/${loteDeUna.body.id}`))
        .set('Authorization', comoUsuario(tokenCoordinador))
        .send(nuevoLote)
        .expect(404);

      await request(ctx.app.getHttpServer())
        .delete(url(otra.id, `/${loteDeUna.body.id}`))
        .set('Authorization', comoUsuario(tokenCoordinador))
        .expect(404);
    });

    it('devuelve 404 si el lote no existe', async () => {
      const emergencia = await sembrarEmergencia();

      await request(ctx.app.getHttpServer())
        .delete(url(emergencia.id, '/99999'))
        .set('Authorization', comoUsuario(tokenCoordinador))
        .expect(404);
    });

    it('un auditor no puede borrar lotes', async () => {
      const emergencia = await sembrarEmergencia();
      const creado = await crearLote(emergencia.id, tokenCoordinador).expect(201);

      await request(ctx.app.getHttpServer())
        .delete(url(emergencia.id, `/${creado.body.id}`))
        .set('Authorization', comoUsuario(tokenAuditor))
        .expect(403);
    });
  });

  // ------------------------------------------------------------------

  describe('Borrado en cascada', () => {
    /**
     * onDelete: Cascade en el schema. Un lote no tiene vida propia fuera de
     * su emergencia, asi que no debe quedar huerfano si la emergencia
     * desaparece.
     */
    it('borrar la emergencia se lleva sus lotes', async () => {
      const emergencia = await sembrarEmergencia();
      await crearLote(emergencia.id, tokenCoordinador).expect(201);

      await ctx.prisma.emergencia.delete({ where: { id: emergencia.id } });

      const huerfanos = await ctx.prisma.lote.count({ where: { emergenciaId: emergencia.id } });
      expect(huerfanos).toBe(0);
    });
  });
});
