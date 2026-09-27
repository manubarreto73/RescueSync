import { EstadoEmergencia, EstadoOferta } from '@prisma/client';
import request from 'supertest';
import { BASE, comoUsuario, login } from './helpers/auth';
import {
  ID_MUNICIPIO,
  ORG_MUNICIPIO,
  ORG_ONG,
  ORG_RESCATE,
  PASSWORD_TEST,
  resetearEstado,
} from './helpers/db';
import { cerrarApp, crearAppDeTest, TestContext } from './helpers/test-app';

describe('Ofertas (e2e)', () => {
  let ctx: TestContext;
  let tokenOng: string;
  let tokenBomberos: string;
  let tokenMunicipio: string;
  let tokenCoordinador: string;
  let tokenAuditor: string;

  /** Segunda ONG, para poder probar consorcios y aislamiento entre ofertantes. */
  const crearUsuarioBomberos = async () => {
    const bcrypt = await import('bcryptjs');
    await ctx.prisma.usuario.create({
      data: {
        email: 'bomberos@test.ar',
        nombreCompleto: 'Carlos Peralta',
        rol: 'REPRESENTANTE_ONG',
        organizacionId: ORG_RESCATE,
        password: await bcrypt.hash(PASSWORD_TEST, 4),
      },
    });
  };

  beforeAll(async () => {
    ctx = await crearAppDeTest();
  });

  beforeEach(async () => {
    await resetearEstado(ctx);
    await crearUsuarioBomberos();

    tokenOng = (await login(ctx.app, 'ong@test.ar')).accessToken;
    tokenBomberos = (await login(ctx.app, 'bomberos@test.ar')).accessToken;
    tokenMunicipio = (await login(ctx.app, 'municipio@test.ar')).accessToken;
    tokenCoordinador = (await login(ctx.app, 'coordinador@test.ar')).accessToken;
    tokenAuditor = (await login(ctx.app, 'auditor@test.ar')).accessToken;
  });

  afterAll(async () => {
    await cerrarApp(ctx);
  });

  /** Emergencia con convocatoria abierta y dos lotes cargados. */
  const sembrarConvocatoria = async (
    // El tipo va explicito: sin el, TypeScript infiere del valor por defecto
    // el tipo literal 'CONVOCATORIA_ABIERTA' y no acepta ningun otro estado.
    estado: EstadoEmergencia = EstadoEmergencia.CONVOCATORIA_ABIERTA,
  ) => {
    const emergencia = await ctx.prisma.emergencia.create({
      data: {
        tipo: 'INUNDACION',
        gravedad: 'ALTA',
        zonaAfectada: 'Barrio Costanera',
        descripcion: 'Crecida del rio con viviendas anegadas en toda la ribera sur.',
        fechaOcurrencia: new Date('2026-09-20T10:00:00.000Z'),
        estado,
        municipioId: ORG_MUNICIPIO,
        registradaPorId: ID_MUNICIPIO,
        lotes: {
          create: [
            {
              categoria: 'PERSONAL',
              descripcion: 'Paramedicos',
              cantidadRequerida: 5,
              unidad: 'personas',
            },
            {
              categoria: 'ALIMENTOS',
              descripcion: 'Raciones de comida',
              cantidadRequerida: 1000,
              unidad: 'raciones',
            },
          ],
        },
      },
      include: { lotes: { orderBy: { id: 'asc' } } },
    });

    return { emergencia, lotePersonal: emergencia.lotes[0], loteAlimentos: emergencia.lotes[1] };
  };

  const crearOferta = (token: string, body: object) =>
    request(ctx.app.getHttpServer())
      .post(`${BASE}/ofertas`)
      .set('Authorization', comoUsuario(token))
      .send(body);

  const accion = (id: number, nombre: string, token: string, body: object = {}) =>
    request(ctx.app.getHttpServer())
      .post(`${BASE}/ofertas/${id}/${nombre}`)
      .set('Authorization', comoUsuario(token))
      .send(body);

  // ------------------------------------------------------------------

  describe('POST /ofertas', () => {
    it('una ONG crea una oferta individual', async () => {
      const { emergencia, lotePersonal } = await sembrarConvocatoria();

      const res = await crearOferta(tokenOng, {
        emergenciaId: emergencia.id,
        lineas: [{ loteId: lotePersonal.id, organizacionId: ORG_ONG, cantidad: 3 }],
        observaciones: 'Disponibilidad inmediata',
      }).expect(201);

      expect(res.body).toMatchObject({
        estado: 'BORRADOR',
        version: 1,
        esConsorcio: false,
        organizacionLiderId: ORG_ONG,
      });
      expect(res.body.participantes).toHaveLength(1);
      expect(res.body.participantes[0].esLider).toBe(true);
      expect(res.body.lineas).toHaveLength(1);
    });

    /** Oferta parcial: 3 de los 5 paramedicos pedidos. */
    it('admite ofertar menos de lo que pide el lote', async () => {
      const { emergencia, lotePersonal } = await sembrarConvocatoria();

      const res = await crearOferta(tokenOng, {
        emergenciaId: emergencia.id,
        lineas: [{ loteId: lotePersonal.id, organizacionId: ORG_ONG, cantidad: 3 }],
      }).expect(201);

      expect(res.body.lineas[0].cantidad).toBe(3);
      expect(res.body.lineas[0].cantidadRequeridaDelLote).toBe(5);
    });

    /**
     * El consorcio de la consigna: dos ONGs se asocian y entre las dos cubren
     * el lote que ninguna podia sola.
     */
    it('dos ONGs se asocian en un consorcio', async () => {
      const { emergencia, lotePersonal } = await sembrarConvocatoria();

      const res = await crearOferta(tokenOng, {
        emergenciaId: emergencia.id,
        organizacionesAsociadas: [ORG_RESCATE],
        lineas: [
          { loteId: lotePersonal.id, organizacionId: ORG_ONG, cantidad: 3 },
          { loteId: lotePersonal.id, organizacionId: ORG_RESCATE, cantidad: 2 },
        ],
      }).expect(201);

      expect(res.body.esConsorcio).toBe(true);
      expect(res.body.participantes).toHaveLength(2);
      expect(res.body.lineas).toHaveLength(2);

      const aportes = res.body.lineas.reduce(
        (total: number, l: { cantidad: number }) => total + l.cantidad,
        0,
      );
      expect(aportes).toBe(5);
    });

    it('el lider queda marcado y los asociados no', async () => {
      const { emergencia, lotePersonal } = await sembrarConvocatoria();

      const res = await crearOferta(tokenOng, {
        emergenciaId: emergencia.id,
        organizacionesAsociadas: [ORG_RESCATE],
        lineas: [{ loteId: lotePersonal.id, organizacionId: ORG_ONG, cantidad: 3 }],
      }).expect(201);

      const lider = res.body.participantes.find((p: { esLider: boolean }) => p.esLider);
      expect(lider.organizacionId).toBe(ORG_ONG);
      expect(res.body.participantes.filter((p: { esLider: boolean }) => p.esLider)).toHaveLength(1);
    });

    /**
     * Sin esta validacion, una ONG podria declarar aportes a nombre de
     * organizaciones que nunca aceptaron participar del consorcio.
     */
    it('rechaza una linea de una organizacion que no participa', async () => {
      const { emergencia, lotePersonal } = await sembrarConvocatoria();

      const res = await crearOferta(tokenOng, {
        emergenciaId: emergencia.id,
        lineas: [{ loteId: lotePersonal.id, organizacionId: ORG_RESCATE, cantidad: 2 }],
      }).expect(400);

      expect(res.body.message).toContain('no figura entre los participantes');
    });

    it('rechaza un lote de otra emergencia', async () => {
      const primera = await sembrarConvocatoria();
      const segunda = await sembrarConvocatoria();

      const res = await crearOferta(tokenOng, {
        emergenciaId: primera.emergencia.id,
        lineas: [{ loteId: segunda.lotePersonal.id, organizacionId: ORG_ONG, cantidad: 2 }],
      }).expect(400);

      expect(res.body.message).toContain('no pertenece a la emergencia');
    });

    it('rechaza dos lineas para el mismo lote y la misma organizacion', async () => {
      const { emergencia, lotePersonal } = await sembrarConvocatoria();

      const res = await crearOferta(tokenOng, {
        emergenciaId: emergencia.id,
        lineas: [
          { loteId: lotePersonal.id, organizacionId: ORG_ONG, cantidad: 2 },
          { loteId: lotePersonal.id, organizacionId: ORG_ONG, cantidad: 1 },
        ],
      }).expect(400);

      expect(res.body.message).toContain('dos lineas para el lote');
    });

    it('rechaza sumar un municipio al consorcio', async () => {
      const { emergencia, lotePersonal } = await sembrarConvocatoria();

      const res = await crearOferta(tokenOng, {
        emergenciaId: emergencia.id,
        organizacionesAsociadas: [ORG_MUNICIPIO],
        lineas: [{ loteId: lotePersonal.id, organizacionId: ORG_ONG, cantidad: 2 }],
      }).expect(400);

      expect(res.body.message).toContain('no puede ofertar');
    });

    it('exige al menos una linea', async () => {
      const { emergencia } = await sembrarConvocatoria();

      await crearOferta(tokenOng, { emergenciaId: emergencia.id, lineas: [] }).expect(400);
    });

    it.each([
      ['municipio', () => tokenMunicipio],
      ['coordinador', () => tokenCoordinador],
      ['auditor', () => tokenAuditor],
    ])('un %s no puede ofertar', async (_perfil, token) => {
      const { emergencia, lotePersonal } = await sembrarConvocatoria();

      await crearOferta(token(), {
        emergenciaId: emergencia.id,
        lineas: [{ loteId: lotePersonal.id, organizacionId: ORG_ONG, cantidad: 1 }],
      }).expect(403);
    });
  });

  // ------------------------------------------------------------------

  describe('Ventana de convocatoria', () => {
    it.each([['REGISTRADA'], ['CONVOCATORIA_CERRADA'], ['EN_ADJUDICACION'], ['FINALIZADA']])(
      'no deja ofertar con la emergencia en %s',
      async (estado) => {
        const { emergencia, lotePersonal } = await sembrarConvocatoria(estado as EstadoEmergencia);

        const res = await crearOferta(tokenOng, {
          emergenciaId: emergencia.id,
          lineas: [{ loteId: lotePersonal.id, organizacionId: ORG_ONG, cantidad: 1 }],
        });

        // REGISTRADA ni siquiera es visible para la ONG: corta antes, con 404.
        expect([400, 404]).toContain(res.status);
      },
    );

    it('no deja editar una vez cerrada la ventana', async () => {
      const { emergencia, lotePersonal } = await sembrarConvocatoria();

      const oferta = await crearOferta(tokenOng, {
        emergenciaId: emergencia.id,
        lineas: [{ loteId: lotePersonal.id, organizacionId: ORG_ONG, cantidad: 3 }],
      }).expect(201);

      await ctx.prisma.emergencia.update({
        where: { id: emergencia.id },
        data: { estado: EstadoEmergencia.CONVOCATORIA_CERRADA },
      });

      const res = await request(ctx.app.getHttpServer())
        .put(`${BASE}/ofertas/${oferta.body.id}`)
        .set('Authorization', comoUsuario(tokenOng))
        .send({ lineas: [{ loteId: lotePersonal.id, organizacionId: ORG_ONG, cantidad: 5 }] })
        .expect(400);

      expect(res.body.message).toContain('ventana de convocatoria no esta abierta');
    });
  });

  // ------------------------------------------------------------------

  describe('Versionado', () => {
    /**
     * La trazabilidad que pide la consigna. Sin ella, una ONG podria bajar su
     * ofrecimiento sobre el cierre y nadie tendria como demostrar que antes
     * ofrecia otra cosa.
     */
    it('cada edicion incrementa la version y deja historial', async () => {
      const { emergencia, lotePersonal } = await sembrarConvocatoria();

      const oferta = await crearOferta(tokenOng, {
        emergenciaId: emergencia.id,
        lineas: [{ loteId: lotePersonal.id, organizacionId: ORG_ONG, cantidad: 3 }],
      }).expect(201);

      expect(oferta.body.version).toBe(1);

      const editada = await request(ctx.app.getHttpServer())
        .put(`${BASE}/ofertas/${oferta.body.id}`)
        .set('Authorization', comoUsuario(tokenOng))
        .send({ lineas: [{ loteId: lotePersonal.id, organizacionId: ORG_ONG, cantidad: 5 }] })
        .expect(200);

      expect(editada.body.version).toBe(2);
      expect(editada.body.lineas[0].cantidad).toBe(5);

      const versiones = await request(ctx.app.getHttpServer())
        .get(`${BASE}/ofertas/${oferta.body.id}/versiones`)
        .set('Authorization', comoUsuario(tokenOng))
        .expect(200);

      expect(versiones.body).toHaveLength(2);
      expect(versiones.body[0].version).toBe(2);
      expect(versiones.body[1].snapshot.lineas[0].cantidad).toBe(3);
    });

    it('la edicion puede sumar una ONG al consorcio', async () => {
      const { emergencia, lotePersonal } = await sembrarConvocatoria();

      const oferta = await crearOferta(tokenOng, {
        emergenciaId: emergencia.id,
        lineas: [{ loteId: lotePersonal.id, organizacionId: ORG_ONG, cantidad: 3 }],
      }).expect(201);

      const editada = await request(ctx.app.getHttpServer())
        .put(`${BASE}/ofertas/${oferta.body.id}`)
        .set('Authorization', comoUsuario(tokenOng))
        .send({
          organizacionesAsociadas: [ORG_RESCATE],
          lineas: [
            { loteId: lotePersonal.id, organizacionId: ORG_ONG, cantidad: 3 },
            { loteId: lotePersonal.id, organizacionId: ORG_RESCATE, cantidad: 2 },
          ],
        })
        .expect(200);

      expect(editada.body.esConsorcio).toBe(true);
    });

    it('solo el lider puede editar la oferta del consorcio', async () => {
      const { emergencia, lotePersonal } = await sembrarConvocatoria();

      const oferta = await crearOferta(tokenOng, {
        emergenciaId: emergencia.id,
        organizacionesAsociadas: [ORG_RESCATE],
        lineas: [{ loteId: lotePersonal.id, organizacionId: ORG_ONG, cantidad: 3 }],
      }).expect(201);

      await request(ctx.app.getHttpServer())
        .put(`${BASE}/ofertas/${oferta.body.id}`)
        .set('Authorization', comoUsuario(tokenBomberos))
        .send({ lineas: [{ loteId: lotePersonal.id, organizacionId: ORG_RESCATE, cantidad: 9 }] })
        .expect(403);
    });
  });

  // ------------------------------------------------------------------

  describe('Alcance por filas', () => {
    /**
     * La regla mas delicada del sistema: si una ONG viera las ofertas de las
     * demas durante la ventana, podria mirar lo que oferto la competencia
     * antes de cerrar la suya.
     */
    it('una ONG no ve las ofertas de otra', async () => {
      const { emergencia, lotePersonal } = await sembrarConvocatoria();

      await crearOferta(tokenOng, {
        emergenciaId: emergencia.id,
        lineas: [{ loteId: lotePersonal.id, organizacionId: ORG_ONG, cantidad: 3 }],
      }).expect(201);

      const res = await request(ctx.app.getHttpServer())
        .get(`${BASE}/ofertas`)
        .set('Authorization', comoUsuario(tokenBomberos))
        .expect(200);

      expect(res.body.totalElements).toBe(0);
    });

    it('si ve aquellas en las que participa como asociada', async () => {
      const { emergencia, lotePersonal } = await sembrarConvocatoria();

      await crearOferta(tokenOng, {
        emergenciaId: emergencia.id,
        organizacionesAsociadas: [ORG_RESCATE],
        lineas: [{ loteId: lotePersonal.id, organizacionId: ORG_ONG, cantidad: 3 }],
      }).expect(201);

      const res = await request(ctx.app.getHttpServer())
        .get(`${BASE}/ofertas`)
        .set('Authorization', comoUsuario(tokenBomberos))
        .expect(200);

      expect(res.body.totalElements).toBe(1);
    });

    /** "El municipio visualiza unicamente las ofertas validadas". */
    it('el municipio no ve las ofertas hasta que esten validadas', async () => {
      const { emergencia, lotePersonal } = await sembrarConvocatoria();

      const oferta = await crearOferta(tokenOng, {
        emergenciaId: emergencia.id,
        lineas: [{ loteId: lotePersonal.id, organizacionId: ORG_ONG, cantidad: 3 }],
      }).expect(201);

      await accion(oferta.body.id, 'presentar', tokenOng).expect(200);

      const antes = await request(ctx.app.getHttpServer())
        .get(`${BASE}/ofertas`)
        .set('Authorization', comoUsuario(tokenMunicipio))
        .expect(200);
      expect(antes.body.totalElements).toBe(0);

      await ctx.prisma.oferta.update({
        where: { id: oferta.body.id },
        data: { estado: EstadoOferta.VALIDADA },
      });

      const despues = await request(ctx.app.getHttpServer())
        .get(`${BASE}/ofertas`)
        .set('Authorization', comoUsuario(tokenMunicipio))
        .expect(200);
      expect(despues.body.totalElements).toBe(1);
    });

    it.each([
      ['coordinador', () => tokenCoordinador],
      ['auditor', () => tokenAuditor],
    ])('el %s ve todas', async (_perfil, token) => {
      const { emergencia, lotePersonal } = await sembrarConvocatoria();

      await crearOferta(tokenOng, {
        emergenciaId: emergencia.id,
        lineas: [{ loteId: lotePersonal.id, organizacionId: ORG_ONG, cantidad: 3 }],
      }).expect(201);

      const res = await request(ctx.app.getHttpServer())
        .get(`${BASE}/ofertas`)
        .set('Authorization', comoUsuario(token()))
        .expect(200);

      expect(res.body.totalElements).toBe(1);
    });
  });

  // ------------------------------------------------------------------

  describe('Ciclo completo de la oferta', () => {
    const armarEscenario = async () => {
      const { emergencia, lotePersonal } = await sembrarConvocatoria();

      const oferta = await crearOferta(tokenOng, {
        emergenciaId: emergencia.id,
        organizacionesAsociadas: [ORG_RESCATE],
        lineas: [
          { loteId: lotePersonal.id, organizacionId: ORG_ONG, cantidad: 3 },
          { loteId: lotePersonal.id, organizacionId: ORG_RESCATE, cantidad: 2 },
        ],
      }).expect(201);

      await accion(oferta.body.id, 'presentar', tokenOng).expect(200);

      return { emergencia, lotePersonal, ofertaId: oferta.body.id as number };
    };

    it('presentar, validar, adjudicar y finalizar entre las dos ONGs', async () => {
      const { emergencia, ofertaId } = await armarEscenario();

      // Bonita cierra la ventana y consulta el consolidado
      await ctx.prisma.emergencia.update({
        where: { id: emergencia.id },
        data: { estado: EstadoEmergencia.CONVOCATORIA_CERRADA },
      });

      const consolidado = await request(ctx.app.getHttpServer())
        .get(`${BASE}/emergencias/${emergencia.id}/ofertas/consolidado`)
        .set('Authorization', comoUsuario(tokenCoordinador))
        .expect(200);

      expect(consolidado.body.totalOfertas).toBe(1);
      expect(consolidado.body.ofertas[0].esConsorcio).toBe(true);
      expect(consolidado.body.ofertas[0].lineas).toHaveLength(2);

      // El Sistema Nacional devuelve perfiles de competencia, no un si/no
      const validacion = await request(ctx.app.getHttpServer())
        .post(`${BASE}/emergencias/${emergencia.id}/ofertas/validar`)
        .set('Authorization', comoUsuario(tokenCoordinador))
        .send({
          resultados: consolidado.body.ofertas[0].lineas.map(
            (l: { lineaId: number }, i: number) => ({
              lineaId: l.lineaId,
              caracter: i === 0 ? 'PRINCIPAL' : 'APOYO_SECUNDARIO',
              perfilCompetencia: 'Habilitacion nivel 2',
            }),
          ),
        })
        .expect(200);

      expect(validacion.body).toMatchObject({ ofertasValidadas: 1, lineasClasificadas: 2 });

      // El municipio adjudica
      await ctx.prisma.emergencia.update({
        where: { id: emergencia.id },
        data: { estado: EstadoEmergencia.EN_ADJUDICACION },
      });

      const adjudicada = await accion(ofertaId, 'adjudicar', tokenMunicipio).expect(200);
      expect(adjudicada.body.estado).toBe('ADJUDICADA');
      expect(adjudicada.body.lineas.map((l: { caracter: string }) => l.caracter)).toEqual([
        'PRINCIPAL',
        'APOYO_SECUNDARIO',
      ]);

      // Cierre bilateral: cada ONG marca su parte
      const primera = await accion(ofertaId, 'finalizar-participacion', tokenOng).expect(200);
      expect(primera.body.estado).toBe('ADJUDICADA');

      const segunda = await accion(ofertaId, 'finalizar-participacion', tokenBomberos).expect(200);
      expect(segunda.body.estado).toBe('FINALIZADA');
    });

    it('la cobertura del lote refleja lo adjudicado', async () => {
      const { emergencia, lotePersonal, ofertaId } = await armarEscenario();

      await ctx.prisma.oferta.update({
        where: { id: ofertaId },
        data: { estado: EstadoOferta.ADJUDICADA },
      });

      const res = await request(ctx.app.getHttpServer())
        .get(`${BASE}/emergencias/${emergencia.id}/lotes`)
        .set('Authorization', comoUsuario(tokenCoordinador))
        .expect(200);

      const lote = res.body.find((l: { id: number }) => l.id === lotePersonal.id);
      expect(lote.cantidadCubierta).toBe(5);
      expect(lote.porcentajeCobertura).toBe(100);
      expect(lote.cubierto).toBe(true);
    });

    it('una ONG no puede finalizar por la otra dos veces', async () => {
      const { ofertaId } = await armarEscenario();

      await ctx.prisma.oferta.update({
        where: { id: ofertaId },
        data: { estado: EstadoOferta.ADJUDICADA },
      });

      await accion(ofertaId, 'finalizar-participacion', tokenOng).expect(200);

      const res = await accion(ofertaId, 'finalizar-participacion', tokenOng).expect(400);
      expect(res.body.message).toContain('ya marco su participacion');
    });

    it('rechazar deja la oferta como NO_ADJUDICADA con motivo', async () => {
      const { emergencia, ofertaId } = await armarEscenario();

      await ctx.prisma.oferta.update({
        where: { id: ofertaId },
        data: { estado: EstadoOferta.VALIDADA },
      });
      await ctx.prisma.emergencia.update({
        where: { id: emergencia.id },
        data: { estado: EstadoEmergencia.EN_ADJUDICACION },
      });

      const res = await accion(ofertaId, 'rechazar', tokenMunicipio, {
        motivo: 'Los lotes ya fueron cubiertos por otra propuesta',
      }).expect(200);

      expect(res.body.estado).toBe('NO_ADJUDICADA');
      expect(res.body.motivoNoAdjudicacion).toContain('ya fueron cubiertos');
    });

    it('no se puede adjudicar sin que la emergencia este EN_ADJUDICACION', async () => {
      const { ofertaId } = await armarEscenario();

      await ctx.prisma.oferta.update({
        where: { id: ofertaId },
        data: { estado: EstadoOferta.VALIDADA },
      });

      const res = await accion(ofertaId, 'adjudicar', tokenMunicipio).expect(400);
      expect(res.body.message).toContain('EN_ADJUDICACION');
    });

    it('retirar saca la oferta de la convocatoria', async () => {
      const { ofertaId } = await armarEscenario();

      const res = await accion(ofertaId, 'retirar', tokenOng).expect(200);
      expect(res.body.estado).toBe('RETIRADA');
    });

    it('una oferta retirada no entra en el consolidado', async () => {
      const { emergencia, ofertaId } = await armarEscenario();

      await accion(ofertaId, 'retirar', tokenOng).expect(200);

      const consolidado = await request(ctx.app.getHttpServer())
        .get(`${BASE}/emergencias/${emergencia.id}/ofertas/consolidado`)
        .set('Authorization', comoUsuario(tokenCoordinador))
        .expect(200);

      expect(consolidado.body.totalOfertas).toBe(0);
    });

    it('no se puede presentar dos veces', async () => {
      const { ofertaId } = await armarEscenario();
      await accion(ofertaId, 'presentar', tokenOng).expect(400);
    });
  });

  // ------------------------------------------------------------------

  describe('Integracion con lotes', () => {
    it('no deja borrar un lote que ya tiene ofertas', async () => {
      const { emergencia, lotePersonal } = await sembrarConvocatoria();

      await crearOferta(tokenOng, {
        emergenciaId: emergencia.id,
        lineas: [{ loteId: lotePersonal.id, organizacionId: ORG_ONG, cantidad: 3 }],
      }).expect(201);

      // Para poder tocar lotes hay que cerrar la convocatoria primero
      await ctx.prisma.emergencia.update({
        where: { id: emergencia.id },
        data: { estado: EstadoEmergencia.CONVOCATORIA_CERRADA },
      });

      const res = await request(ctx.app.getHttpServer())
        .delete(`${BASE}/emergencias/${emergencia.id}/lotes/${lotePersonal.id}`)
        .set('Authorization', comoUsuario(tokenCoordinador))
        .expect(400);

      expect(res.body.message).toContain('ya hay ofertas que lo referencian');
    });
  });
});
