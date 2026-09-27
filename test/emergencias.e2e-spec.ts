import { EstadoEmergencia } from '@prisma/client';
import request from 'supertest';
import { BASE, comoUsuario, login } from './helpers/auth';
import { ID_MUNICIPIO, ORG_MUNICIPIO, ORG_ONG, resetearEstado } from './helpers/db';
import { cerrarApp, crearAppDeTest, TestContext } from './helpers/test-app';

describe('Emergencias (e2e)', () => {
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

  const nuevaEmergencia = {
    tipo: 'INUNDACION',
    gravedad: 'ALTA',
    zonaAfectada: 'Barrio Costanera, margen sur del rio',
    descripcion: 'Crecida del rio tras 48 horas de lluvias. Viviendas anegadas en la ribera.',
    personasAfectadas: 350,
    fechaOcurrencia: '2026-09-22T14:30:00.000Z',
  };

  const enUnaSemana = () => new Date(Date.now() + 7 * 86400 * 1000).toISOString();

  /** Crea una emergencia directo en la base, en el estado que pida el test. */
  const sembrarEmergencia = async (
    estado: EstadoEmergencia = EstadoEmergencia.REGISTRADA,
    municipioId = ORG_MUNICIPIO,
  ) => {
    return ctx.prisma.emergencia.create({
      data: {
        tipo: 'INCENDIO',
        gravedad: 'CRITICA',
        zonaAfectada: 'Sierras del oeste',
        descripcion: 'Foco activo sobre ladera norte, avance sostenido por viento.',
        fechaOcurrencia: new Date('2026-09-20T10:00:00.000Z'),
        estado,
        municipioId,
        registradaPorId: ID_MUNICIPIO,
      },
    });
  };

  /** Sin al menos un lote no se puede publicar la convocatoria. */
  const sembrarLote = (emergenciaId: number) =>
    ctx.prisma.lote.create({
      data: {
        emergenciaId,
        categoria: 'PERSONAL',
        descripcion: 'Paramedicos con experiencia en rescate',
        cantidadRequerida: 5,
        unidad: 'personas',
      },
    });

  const post = (id: number, accion: string, token: string, body: object = {}) =>
    request(ctx.app.getHttpServer())
      .post(`${BASE}/emergencias/${id}/${accion}`)
      .set('Authorization', comoUsuario(token))
      .send(body);

  // ------------------------------------------------------------------

  describe('POST /emergencias', () => {
    it('el municipio registra una emergencia', async () => {
      const res = await request(ctx.app.getHttpServer())
        .post(`${BASE}/emergencias`)
        .set('Authorization', comoUsuario(tokenMunicipio))
        .send(nuevaEmergencia)
        .expect(201);

      expect(res.body).toMatchObject({
        tipo: 'INUNDACION',
        gravedad: 'ALTA',
        estado: 'REGISTRADA',
        municipioId: ORG_MUNICIPIO,
        municipioNombre: 'Municipalidad de Villa Test',
        registradaPorNombre: 'Laura Fernandez',
      });
    });

    /**
     * El municipio sale del token, no del body. Si viniera del request, un
     * operador podria registrar emergencias a nombre de otro municipio.
     */
    it('ignora cualquier municipioId que venga en el body', async () => {
      const res = await request(ctx.app.getHttpServer())
        .post(`${BASE}/emergencias`)
        .set('Authorization', comoUsuario(tokenMunicipio))
        .send({ ...nuevaEmergencia, municipioId: ORG_ONG })
        .expect(400);

      expect(res.body.message.join(' ')).toContain('municipioId should not exist');
    });

    it('nace en estado REGISTRADA y sin caso de Bonita', async () => {
      const res = await request(ctx.app.getHttpServer())
        .post(`${BASE}/emergencias`)
        .set('Authorization', comoUsuario(tokenMunicipio))
        .send(nuevaEmergencia)
        .expect(201);

      expect(res.body.estado).toBe('REGISTRADA');
      expect(res.body.bonitaCaseId).toBeNull();
      expect(res.body.fechaCierreConvocatoria).toBeNull();
    });

    it.each([
      ['coordinador', () => tokenCoordinador],
      ['ong', () => tokenOng],
      ['auditor', () => tokenAuditor],
    ])('un %s no puede registrar emergencias', async (_perfil, token) => {
      await request(ctx.app.getHttpServer())
        .post(`${BASE}/emergencias`)
        .set('Authorization', comoUsuario(token()))
        .send(nuevaEmergencia)
        .expect(403);
    });

    it.each([
      ['tipo inexistente', { tipo: 'METEORITO' }],
      ['gravedad inexistente', { gravedad: 'MUY_ALTA' }],
      ['descripcion demasiado corta', { descripcion: 'Se inundo' }],
      ['zona vacia', { zonaAfectada: '' }],
      ['personas afectadas negativas', { personasAfectadas: -5 }],
      ['fecha de ocurrencia invalida', { fechaOcurrencia: 'ayer' }],
    ])('rechaza con 400: %s', async (_caso, sobrescribe) => {
      await request(ctx.app.getHttpServer())
        .post(`${BASE}/emergencias`)
        .set('Authorization', comoUsuario(tokenMunicipio))
        .send({ ...nuevaEmergencia, ...sobrescribe })
        .expect(400);
    });

    /** Un desastre que todavia no paso no se puede reportar. */
    it('rechaza una fecha de ocurrencia futura', async () => {
      const res = await request(ctx.app.getHttpServer())
        .post(`${BASE}/emergencias`)
        .set('Authorization', comoUsuario(tokenMunicipio))
        .send({ ...nuevaEmergencia, fechaOcurrencia: enUnaSemana() })
        .expect(400);

      expect(res.body.message.join(' ')).toContain('no puede estar en el futuro');
    });
  });

  // ------------------------------------------------------------------

  describe('Alcance por filas', () => {
    it('el municipio no ve las emergencias de otro municipio', async () => {
      await sembrarEmergencia(EstadoEmergencia.REGISTRADA, ORG_MUNICIPIO);

      // Un segundo municipio con su propia emergencia
      const otro = await ctx.prisma.organizacion.create({
        data: { nombre: 'Municipalidad Vecina', tipo: 'MUNICIPIO' },
      });
      await sembrarEmergencia(EstadoEmergencia.REGISTRADA, otro.id);

      const res = await request(ctx.app.getHttpServer())
        .get(`${BASE}/emergencias`)
        .set('Authorization', comoUsuario(tokenMunicipio))
        .expect(200);

      expect(res.body.totalElements).toBe(1);
      expect(res.body.content[0].municipioId).toBe(ORG_MUNICIPIO);
    });

    /**
     * 404 y no 403 a proposito: un 403 confirmaria que el recurso existe, y
     * eso ya es informacion. Un municipio no tiene por que enterarse de
     * cuantas emergencias cargo el vecino probando ids.
     */
    it('pedir la emergencia de otro municipio da 404, no 403', async () => {
      const otro = await ctx.prisma.organizacion.create({
        data: { nombre: 'Municipalidad Vecina', tipo: 'MUNICIPIO' },
      });
      const ajena = await sembrarEmergencia(EstadoEmergencia.REGISTRADA, otro.id);

      await request(ctx.app.getHttpServer())
        .get(`${BASE}/emergencias/${ajena.id}`)
        .set('Authorization', comoUsuario(tokenMunicipio))
        .expect(404);
    });

    /**
     * Una emergencia REGISTRADA todavia no se difundio a la red: el
     * Coordinador la esta desglosando en lotes. Mostrarsela a las ONGs las
     * llevaria a ofertar sobre necesidades que todavia no existen.
     */
    it('la ONG no ve emergencias que aun no se publicaron', async () => {
      await sembrarEmergencia(EstadoEmergencia.REGISTRADA);

      const res = await request(ctx.app.getHttpServer())
        .get(`${BASE}/emergencias`)
        .set('Authorization', comoUsuario(tokenOng))
        .expect(200);

      expect(res.body.totalElements).toBe(0);
    });

    it('la ONG si ve las que ya tienen convocatoria abierta', async () => {
      await sembrarEmergencia(EstadoEmergencia.CONVOCATORIA_ABIERTA);

      const res = await request(ctx.app.getHttpServer())
        .get(`${BASE}/emergencias`)
        .set('Authorization', comoUsuario(tokenOng))
        .expect(200);

      expect(res.body.totalElements).toBe(1);
    });

    it('la ONG no ve las canceladas', async () => {
      await sembrarEmergencia(EstadoEmergencia.CANCELADA);

      const res = await request(ctx.app.getHttpServer())
        .get(`${BASE}/emergencias`)
        .set('Authorization', comoUsuario(tokenOng))
        .expect(200);

      expect(res.body.totalElements).toBe(0);
    });

    it.each([
      ['coordinador', () => tokenCoordinador],
      ['auditor', () => tokenAuditor],
    ])('el %s ve todas, de cualquier municipio y estado', async (_perfil, token) => {
      const otro = await ctx.prisma.organizacion.create({
        data: { nombre: 'Municipalidad Vecina', tipo: 'MUNICIPIO' },
      });
      await sembrarEmergencia(EstadoEmergencia.REGISTRADA, ORG_MUNICIPIO);
      await sembrarEmergencia(EstadoEmergencia.CANCELADA, otro.id);

      const res = await request(ctx.app.getHttpServer())
        .get(`${BASE}/emergencias`)
        .set('Authorization', comoUsuario(token()))
        .expect(200);

      expect(res.body.totalElements).toBe(2);
    });

    /**
     * El alcance se combina con AND: ningun query param puede ampliarlo.
     * Si se combinara con OR, filtrar por estado dejaria ver emergencias
     * ajenas.
     */
    it('un filtro del cliente no puede ampliar el alcance', async () => {
      const otro = await ctx.prisma.organizacion.create({
        data: { nombre: 'Municipalidad Vecina', tipo: 'MUNICIPIO' },
      });
      await sembrarEmergencia(EstadoEmergencia.REGISTRADA, otro.id);

      const res = await request(ctx.app.getHttpServer())
        .get(`${BASE}/emergencias?estado=REGISTRADA`)
        .set('Authorization', comoUsuario(tokenMunicipio))
        .expect(200);

      expect(res.body.totalElements).toBe(0);
    });
  });

  // ------------------------------------------------------------------

  describe('GET /emergencias', () => {
    it('filtra por gravedad y por tipo', async () => {
      await sembrarEmergencia();

      const porGravedad = await request(ctx.app.getHttpServer())
        .get(`${BASE}/emergencias?gravedad=CRITICA`)
        .set('Authorization', comoUsuario(tokenCoordinador))
        .expect(200);
      expect(porGravedad.body.totalElements).toBe(1);

      const porTipo = await request(ctx.app.getHttpServer())
        .get(`${BASE}/emergencias?tipo=INUNDACION`)
        .set('Authorization', comoUsuario(tokenCoordinador))
        .expect(200);
      expect(porTipo.body.totalElements).toBe(0);
    });

    it('busca en zona afectada y descripcion', async () => {
      await sembrarEmergencia();

      const res = await request(ctx.app.getHttpServer())
        .get(`${BASE}/emergencias?busqueda=LADERA`)
        .set('Authorization', comoUsuario(tokenCoordinador))
        .expect(200);

      expect(res.body.totalElements).toBe(1);
    });

    it('ordena las mas graves primero', async () => {
      await ctx.prisma.emergencia.createMany({
        data: [
          {
            tipo: 'TORMENTA_SEVERA',
            gravedad: 'BAJA',
            zonaAfectada: 'Centro',
            descripcion: 'Caida de ramas y cortes de luz puntuales en el centro.',
            fechaOcurrencia: new Date('2026-09-21T10:00:00.000Z'),
            municipioId: ORG_MUNICIPIO,
            registradaPorId: ID_MUNICIPIO,
          },
        ],
      });
      await sembrarEmergencia(); // CRITICA

      const res = await request(ctx.app.getHttpServer())
        .get(`${BASE}/emergencias`)
        .set('Authorization', comoUsuario(tokenCoordinador))
        .expect(200);

      expect(res.body.content.map((e: { gravedad: string }) => e.gravedad)).toEqual([
        'CRITICA',
        'BAJA',
      ]);
    });
  });

  // ------------------------------------------------------------------

  describe('PUT /emergencias/:id', () => {
    it('el municipio corrige mientras esta REGISTRADA', async () => {
      const emergencia = await sembrarEmergencia();

      const res = await request(ctx.app.getHttpServer())
        .put(`${BASE}/emergencias/${emergencia.id}`)
        .set('Authorization', comoUsuario(tokenMunicipio))
        .send({ ...nuevaEmergencia, gravedad: 'CRITICA' })
        .expect(200);

      expect(res.body.gravedad).toBe('CRITICA');
      expect(res.body.zonaAfectada).toBe(nuevaEmergencia.zonaAfectada);
    });

    /**
     * Una vez publicada la convocatoria, las ONGs ya ofertaron sobre la
     * informacion original: cambiarla despues invalidaria sus ofertas en
     * silencio.
     */
    it.each([['CONVOCATORIA_ABIERTA'], ['CONVOCATORIA_CERRADA'], ['EN_EJECUCION'], ['FINALIZADA']])(
      'no deja editar en estado %s',
      async (estado) => {
        const emergencia = await sembrarEmergencia(estado as EstadoEmergencia);

        const res = await request(ctx.app.getHttpServer())
          .put(`${BASE}/emergencias/${emergencia.id}`)
          .set('Authorization', comoUsuario(tokenMunicipio))
          .send(nuevaEmergencia)
          .expect(400);

        expect(res.body.message).toContain('Solo se puede editar');
      },
    );

    it('el coordinador no puede editar los datos cargados por el municipio', async () => {
      const emergencia = await sembrarEmergencia();

      await request(ctx.app.getHttpServer())
        .put(`${BASE}/emergencias/${emergencia.id}`)
        .set('Authorization', comoUsuario(tokenCoordinador))
        .send(nuevaEmergencia)
        .expect(403);
    });
  });

  // ------------------------------------------------------------------

  describe('Maquina de estados', () => {
    it('recorre el ciclo completo hasta FINALIZADA', async () => {
      const emergencia = await sembrarEmergencia();
      await sembrarLote(emergencia.id);

      let res = await post(emergencia.id, 'publicar-convocatoria', tokenCoordinador, {
        fechaCierreConvocatoria: enUnaSemana(),
      }).expect(200);
      expect(res.body.estado).toBe('CONVOCATORIA_ABIERTA');
      expect(res.body.fechaCierreConvocatoria).not.toBeNull();

      res = await post(emergencia.id, 'cerrar-convocatoria', tokenCoordinador).expect(200);
      expect(res.body.estado).toBe('CONVOCATORIA_CERRADA');

      res = await post(emergencia.id, 'habilitar-adjudicacion', tokenCoordinador).expect(200);
      expect(res.body.estado).toBe('EN_ADJUDICACION');

      res = await post(emergencia.id, 'adjudicar', tokenMunicipio).expect(200);
      expect(res.body.estado).toBe('EN_EJECUCION');

      res = await post(emergencia.id, 'finalizar', tokenCoordinador).expect(200);
      expect(res.body.estado).toBe('FINALIZADA');
    });

    /** El camino alternativo del temporizador que pide la consigna. */
    it('permite reabrir la convocatoria si los lotes no se cubrieron', async () => {
      const emergencia = await sembrarEmergencia(EstadoEmergencia.CONVOCATORIA_CERRADA);

      const res = await post(emergencia.id, 'reabrir-convocatoria', tokenCoordinador, {
        fechaCierreConvocatoria: enUnaSemana(),
      }).expect(200);

      expect(res.body.estado).toBe('CONVOCATORIA_ABIERTA');
    });

    it.each([
      ['publicar-convocatoria', 'CONVOCATORIA_ABIERTA'],
      ['cerrar-convocatoria', 'REGISTRADA'],
      ['habilitar-adjudicacion', 'REGISTRADA'],
      ['finalizar', 'CONVOCATORIA_ABIERTA'],
    ])('rechaza %s desde el estado %s', async (accion, estado) => {
      const emergencia = await sembrarEmergencia(estado as EstadoEmergencia);

      const res = await post(emergencia.id, accion, tokenCoordinador, {
        fechaCierreConvocatoria: enUnaSemana(),
      }).expect(400);

      expect(res.body.message).toContain('la emergencia esta en estado');
    });

    it('rechaza adjudicar desde un estado que no sea EN_ADJUDICACION', async () => {
      const emergencia = await sembrarEmergencia(EstadoEmergencia.CONVOCATORIA_ABIERTA);
      await post(emergencia.id, 'adjudicar', tokenMunicipio).expect(400);
    });

    it('no permite publicar dos veces', async () => {
      const emergencia = await sembrarEmergencia();
      await sembrarLote(emergencia.id);

      await post(emergencia.id, 'publicar-convocatoria', tokenCoordinador, {
        fechaCierreConvocatoria: enUnaSemana(),
      }).expect(200);

      await post(emergencia.id, 'publicar-convocatoria', tokenCoordinador, {
        fechaCierreConvocatoria: enUnaSemana(),
      }).expect(400);
    });

    it('una emergencia FINALIZADA no admite ninguna accion mas', async () => {
      const emergencia = await sembrarEmergencia(EstadoEmergencia.FINALIZADA);

      await post(emergencia.id, 'cerrar-convocatoria', tokenCoordinador).expect(400);
      await post(emergencia.id, 'finalizar', tokenCoordinador).expect(400);
      await post(emergencia.id, 'cancelar', tokenCoordinador, {
        motivo: 'Se quiere cancelar algo ya terminado',
      }).expect(400);
    });
  });

  // ------------------------------------------------------------------

  describe('Permisos de las transiciones', () => {
    it('la ONG no puede ejecutar ninguna transicion', async () => {
      const emergencia = await sembrarEmergencia(EstadoEmergencia.CONVOCATORIA_ABIERTA);

      await post(emergencia.id, 'cerrar-convocatoria', tokenOng).expect(403);
      await post(emergencia.id, 'cancelar', tokenOng, { motivo: 'Motivo cualquiera' }).expect(403);
    });

    it('el auditor observa pero no interviene', async () => {
      const emergencia = await sembrarEmergencia();

      await request(ctx.app.getHttpServer())
        .get(`${BASE}/emergencias/${emergencia.id}`)
        .set('Authorization', comoUsuario(tokenAuditor))
        .expect(200);

      await post(emergencia.id, 'publicar-convocatoria', tokenAuditor, {
        fechaCierreConvocatoria: enUnaSemana(),
      }).expect(403);
    });

    it('el municipio no puede publicar la convocatoria', async () => {
      const emergencia = await sembrarEmergencia();

      await post(emergencia.id, 'publicar-convocatoria', tokenMunicipio, {
        fechaCierreConvocatoria: enUnaSemana(),
      }).expect(403);
    });

    it('el coordinador no puede adjudicar por el municipio', async () => {
      const emergencia = await sembrarEmergencia(EstadoEmergencia.EN_ADJUDICACION);
      await post(emergencia.id, 'adjudicar', tokenCoordinador).expect(403);
    });

    it('un municipio no puede adjudicar la emergencia de otro', async () => {
      const otro = await ctx.prisma.organizacion.create({
        data: { nombre: 'Municipalidad Vecina', tipo: 'MUNICIPIO' },
      });
      const ajena = await sembrarEmergencia(EstadoEmergencia.EN_ADJUDICACION, otro.id);

      // 404 porque ni siquiera la ve: el alcance corta antes que el permiso.
      await post(ajena.id, 'adjudicar', tokenMunicipio).expect(404);
    });
  });

  // ------------------------------------------------------------------

  describe('Convocatoria', () => {
    /**
     * Publicar sin lotes deja a la red sin saber sobre que ofertar: es el
     * desglose en necesidades cuantificadas lo que convierte una alerta en
     * una convocatoria.
     */
    it('no deja publicar una convocatoria sin lotes cargados', async () => {
      const emergencia = await sembrarEmergencia();

      const res = await post(emergencia.id, 'publicar-convocatoria', tokenCoordinador, {
        fechaCierreConvocatoria: enUnaSemana(),
      }).expect(400);

      expect(res.body.message).toContain('sin lotes cargados');
    });

    it('publica con al menos un lote', async () => {
      const emergencia = await sembrarEmergencia();
      await sembrarLote(emergencia.id);

      const res = await post(emergencia.id, 'publicar-convocatoria', tokenCoordinador, {
        fechaCierreConvocatoria: enUnaSemana(),
      }).expect(200);

      expect(res.body.estado).toBe('CONVOCATORIA_ABIERTA');
    });

    it('exige que la fecha de cierre este en el futuro', async () => {
      const emergencia = await sembrarEmergencia();

      const res = await post(emergencia.id, 'publicar-convocatoria', tokenCoordinador, {
        fechaCierreConvocatoria: '2020-01-01T00:00:00.000Z',
      }).expect(400);

      expect(res.body.message.join(' ')).toContain('tiene que estar en el futuro');
    });

    it('exige la fecha de cierre', async () => {
      const emergencia = await sembrarEmergencia();
      await post(emergencia.id, 'publicar-convocatoria', tokenCoordinador, {}).expect(400);
    });

    it('la reapertura tambien exige una fecha futura', async () => {
      const emergencia = await sembrarEmergencia(EstadoEmergencia.CONVOCATORIA_CERRADA);

      await post(emergencia.id, 'reabrir-convocatoria', tokenCoordinador, {
        fechaCierreConvocatoria: '2020-01-01T00:00:00.000Z',
      }).expect(400);
    });
  });

  // ------------------------------------------------------------------

  describe('Cancelacion', () => {
    it('el municipio cancela la suya con un motivo', async () => {
      const emergencia = await sembrarEmergencia();

      const res = await post(emergencia.id, 'cancelar', tokenMunicipio, {
        motivo: 'La crecida cedio y se resolvio con recursos propios',
      }).expect(200);

      expect(res.body.estado).toBe('CANCELADA');
      expect(res.body.motivoCancelacion).toContain('La crecida cedio');
    });

    it('el coordinador puede cancelar la de cualquier municipio', async () => {
      const otro = await ctx.prisma.organizacion.create({
        data: { nombre: 'Municipalidad Vecina', tipo: 'MUNICIPIO' },
      });
      const ajena = await sembrarEmergencia(EstadoEmergencia.REGISTRADA, otro.id);

      await post(ajena.id, 'cancelar', tokenCoordinador, {
        motivo: 'Duplicada con otra emergencia ya registrada',
      }).expect(200);
    });

    it('exige un motivo de al menos 10 caracteres', async () => {
      const emergencia = await sembrarEmergencia();

      await post(emergencia.id, 'cancelar', tokenMunicipio, { motivo: 'no' }).expect(400);
      await post(emergencia.id, 'cancelar', tokenMunicipio, {}).expect(400);
    });

    /**
     * En EN_EJECUCION ya hay recursos comprometidos en el Sistema Nacional y
     * gente movilizada. Abandonar un despliegue en curso no es cancelar.
     */
    it('no deja cancelar una emergencia en ejecucion', async () => {
      const emergencia = await sembrarEmergencia(EstadoEmergencia.EN_EJECUCION);

      const res = await post(emergencia.id, 'cancelar', tokenCoordinador, {
        motivo: 'Se quiere abandonar el despliegue',
      }).expect(400);

      expect(res.body.message).toContain('EN_EJECUCION');
    });
  });
});
