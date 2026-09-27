import request from 'supertest';
import { BASE, comoUsuario, login } from './helpers/auth';
import { ORG_MUNICIPIO, ORG_ONG, ORG_RESCATE, resetearEstado } from './helpers/db';
import { cerrarApp, crearAppDeTest, TestContext } from './helpers/test-app';

describe('Organizaciones (e2e)', () => {
  let ctx: TestContext;
  let tokenCoordinador: string;
  let tokenAuditor: string;
  let tokenOng: string;
  let tokenMunicipio: string;

  beforeAll(async () => {
    ctx = await crearAppDeTest();
  });

  beforeEach(async () => {
    await resetearEstado(ctx);
    tokenCoordinador = (await login(ctx.app, 'coordinador@test.ar')).accessToken;
    tokenAuditor = (await login(ctx.app, 'auditor@test.ar')).accessToken;
    tokenOng = (await login(ctx.app, 'ong@test.ar')).accessToken;
    tokenMunicipio = (await login(ctx.app, 'municipio@test.ar')).accessToken;
  });

  afterAll(async () => {
    await cerrarApp(ctx);
  });

  const nuevaOrganizacion = {
    nombre: 'Manos Unidas',
    tipo: 'ONG',
    cuit: '30999999999',
    codigoNacional: 'ONG-9999',
    emailContacto: 'contacto@manosunidas.org',
    telefonoContacto: '+54 9 351 555-1000',
    localidad: 'Alta Gracia',
    provincia: 'Cordoba',
  };

  describe('RBAC', () => {
    /**
     * El REPRESENTANTE_ONG puede listar, y no es un descuido: la consigna
     * pide que las ONGs se asocien en consorcios "mediante la interfaz", y
     * para eso tienen que poder encontrar a las otras.
     */
    it.each([
      ['coordinador', 200],
      ['auditor', 200],
      ['ong', 200],
      ['municipio', 403],
    ] as const)('GET /organizaciones como %s -> %i', async (perfil, esperado) => {
      const tokens = {
        coordinador: tokenCoordinador,
        auditor: tokenAuditor,
        ong: tokenOng,
        municipio: tokenMunicipio,
      };

      await request(ctx.app.getHttpServer())
        .get(`${BASE}/organizaciones`)
        .set('Authorization', comoUsuario(tokens[perfil]))
        .expect(esperado);
    });

    it.each([
      ['auditor', 403],
      ['ong', 403],
      ['municipio', 403],
    ] as const)('POST /organizaciones como %s -> %i', async (perfil, esperado) => {
      const tokens = { auditor: tokenAuditor, ong: tokenOng, municipio: tokenMunicipio };

      await request(ctx.app.getHttpServer())
        .post(`${BASE}/organizaciones`)
        .set('Authorization', comoUsuario(tokens[perfil]))
        .send(nuevaOrganizacion)
        .expect(esperado);
    });

    it('sin token devuelve 401', async () => {
      await request(ctx.app.getHttpServer()).get(`${BASE}/organizaciones`).expect(401);
    });
  });

  describe('POST /organizaciones', () => {
    it('da de alta la organizacion', async () => {
      const res = await request(ctx.app.getHttpServer())
        .post(`${BASE}/organizaciones`)
        .set('Authorization', comoUsuario(tokenCoordinador))
        .send(nuevaOrganizacion)
        .expect(201);

      expect(res.body).toMatchObject({
        nombre: 'Manos Unidas',
        tipo: 'ONG',
        cuit: '30999999999',
        codigoNacional: 'ONG-9999',
        activo: true,
      });
    });

    it.each([
      ['nombre', { nombre: 'Cruz Solidaria' }, 'ese nombre'],
      ['CUIT', { cuit: '30222222222' }, 'ese CUIT'],
    ])('rechaza un %s duplicado', async (_campo, sobrescribe, fragmento) => {
      const res = await request(ctx.app.getHttpServer())
        .post(`${BASE}/organizaciones`)
        .set('Authorization', comoUsuario(tokenCoordinador))
        .send({ ...nuevaOrganizacion, ...sobrescribe })
        .expect(400);

      expect(res.body.message).toContain(fragmento);
    });

    it.each([
      ['CUIT con guiones', { cuit: '30-99999999-9' }],
      ['CUIT de menos digitos', { cuit: '123' }],
      ['tipo inexistente', { tipo: 'FUNDACION' }],
      ['email de contacto invalido', { emailContacto: 'sin-arroba' }],
      ['nombre muy corto', { nombre: 'AB' }],
    ])('rechaza con 400: %s', async (_caso, sobrescribe) => {
      await request(ctx.app.getHttpServer())
        .post(`${BASE}/organizaciones`)
        .set('Authorization', comoUsuario(tokenCoordinador))
        .send({ ...nuevaOrganizacion, ...sobrescribe })
        .expect(400);
    });

    it('acepta que los datos de contacto sean opcionales', async () => {
      const res = await request(ctx.app.getHttpServer())
        .post(`${BASE}/organizaciones`)
        .set('Authorization', comoUsuario(tokenCoordinador))
        .send({ nombre: 'Minima', tipo: 'ENTE_GUBERNAMENTAL' })
        .expect(201);

      expect(res.body.cuit).toBeNull();
      expect(res.body.emailContacto).toBeNull();
    });
  });

  describe('GET /organizaciones', () => {
    it('devuelve la pagina con su metadata', async () => {
      const res = await request(ctx.app.getHttpServer())
        .get(`${BASE}/organizaciones`)
        .set('Authorization', comoUsuario(tokenCoordinador))
        .expect(200);

      expect(res.body).toMatchObject({ page: 0, size: 20, totalElements: 3 });
    });

    it('filtra por tipo', async () => {
      const res = await request(ctx.app.getHttpServer())
        .get(`${BASE}/organizaciones?tipo=ONG`)
        .set('Authorization', comoUsuario(tokenOng))
        .expect(200);

      expect(res.body.totalElements).toBe(1);
      expect(res.body.content[0].nombre).toBe('Cruz Solidaria');
    });

    it('busca por nombre sin distinguir mayusculas', async () => {
      const res = await request(ctx.app.getHttpServer())
        .get(`${BASE}/organizaciones?busqueda=bomberos`)
        .set('Authorization', comoUsuario(tokenCoordinador))
        .expect(200);

      expect(res.body.totalElements).toBe(1);
    });

    it('no incluye organizaciones dadas de baja', async () => {
      await ctx.prisma.organizacion.update({
        where: { id: ORG_RESCATE },
        data: { activo: false },
      });

      const res = await request(ctx.app.getHttpServer())
        .get(`${BASE}/organizaciones`)
        .set('Authorization', comoUsuario(tokenCoordinador))
        .expect(200);

      expect(res.body.totalElements).toBe(2);
    });
  });

  describe('GET y PATCH /organizaciones/mia', () => {
    it('devuelve la organizacion del usuario autenticado', async () => {
      const res = await request(ctx.app.getHttpServer())
        .get(`${BASE}/organizaciones/mia`)
        .set('Authorization', comoUsuario(tokenOng))
        .expect(200);

      expect(res.body).toMatchObject({ id: ORG_ONG, nombre: 'Cruz Solidaria' });
    });

    it('el municipio ve la suya, no la de la ONG', async () => {
      const res = await request(ctx.app.getHttpServer())
        .get(`${BASE}/organizaciones/mia`)
        .set('Authorization', comoUsuario(tokenMunicipio))
        .expect(200);

      expect(res.body.id).toBe(ORG_MUNICIPIO);
    });

    /**
     * 403 y no 404: el recurso no falta, es el usuario el que no tiene una
     * organizacion sobre la cual operar. El coordinador y el auditor son
     * transversales a la red.
     */
    it('devuelve 403 para un perfil sin organizacion', async () => {
      const res = await request(ctx.app.getHttpServer())
        .get(`${BASE}/organizaciones/mia`)
        .set('Authorization', comoUsuario(tokenCoordinador))
        .expect(403);

      expect(res.body.message).toContain('no pertenece a ninguna organizacion');
    });

    it('la ruta "mia" no se confunde con un id', async () => {
      // Si @Get(':id') estuviera declarado antes, el ParseIntPipe recibiria
      // la palabra "mia" y devolveria 400 en vez de resolver la ruta.
      await request(ctx.app.getHttpServer())
        .get(`${BASE}/organizaciones/mia`)
        .set('Authorization', comoUsuario(tokenOng))
        .expect(200);
    });

    it('el referente actualiza los datos de contacto de su organizacion', async () => {
      const res = await request(ctx.app.getHttpServer())
        .patch(`${BASE}/organizaciones/mia`)
        .set('Authorization', comoUsuario(tokenOng))
        .send({
          emailContacto: 'nuevo@cruzsolidaria.org',
          telefonoContacto: '+54 9 351 555-2000',
          localidad: 'Rio Cuarto',
          provincia: 'Cordoba',
        })
        .expect(200);

      expect(res.body).toMatchObject({
        id: ORG_ONG,
        emailContacto: 'nuevo@cruzsolidaria.org',
        localidad: 'Rio Cuarto',
      });
    });

    /**
     * El codigo nacional es la clave con la que el Sistema Nacional bloquea y
     * libera recursos. Si una ONG pudiera cambiarlo sola, podria apropiarse de
     * los recursos comprometidos por otra.
     */
    it.each([
      ['nombre', { nombre: 'Otro Nombre' }],
      ['tipo', { tipo: 'MUNICIPIO' }],
      ['cuit', { cuit: '30888888888' }],
      ['codigoNacional', { codigoNacional: 'ONG-0001' }],
    ])('no deja que el referente se edite el %s', async (_campo, extra) => {
      const res = await request(ctx.app.getHttpServer())
        .patch(`${BASE}/organizaciones/mia`)
        .set('Authorization', comoUsuario(tokenOng))
        .send({ localidad: 'Cordoba', ...extra })
        .expect(400);

      expect(res.body.message.join(' ')).toContain('should not exist');
    });

    it('un auditor no puede usar la ruta de autogestion', async () => {
      await request(ctx.app.getHttpServer())
        .patch(`${BASE}/organizaciones/mia`)
        .set('Authorization', comoUsuario(tokenAuditor))
        .send({ localidad: 'Cordoba' })
        .expect(403);
    });
  });

  describe('PUT /organizaciones/:id', () => {
    const cambios = {
      nombre: 'Cruz Solidaria Regional',
      cuit: '30222222222',
      codigoNacional: 'ONG-0001',
      emailContacto: 'nuevo@cruzsolidaria.org',
      telefonoContacto: '+54 9 351 555-3000',
      localidad: 'Cordoba',
      provincia: 'Cordoba',
    };

    it('actualiza los campos editables', async () => {
      const res = await request(ctx.app.getHttpServer())
        .put(`${BASE}/organizaciones/${ORG_ONG}`)
        .set('Authorization', comoUsuario(tokenCoordinador))
        .send(cambios)
        .expect(200);

      expect(res.body.nombre).toBe('Cruz Solidaria Regional');
    });

    /**
     * Cambiarle el tipo a una organizacion que ya tiene usuarios dejaria a un
     * REPRESENTANTE_ONG colgando de un MUNICIPIO, rompiendo la coherencia
     * entre rol y pertenencia. Por eso el campo no esta en el DTO.
     */
    it('no permite cambiar el tipo', async () => {
      const res = await request(ctx.app.getHttpServer())
        .put(`${BASE}/organizaciones/${ORG_ONG}`)
        .set('Authorization', comoUsuario(tokenCoordinador))
        .send({ ...cambios, tipo: 'MUNICIPIO' })
        .expect(400);

      expect(res.body.message.join(' ')).toContain('tipo should not exist');
    });

    it('permite conservar el propio nombre sin chocar consigo misma', async () => {
      await request(ctx.app.getHttpServer())
        .put(`${BASE}/organizaciones/${ORG_ONG}`)
        .set('Authorization', comoUsuario(tokenCoordinador))
        .send({ ...cambios, nombre: 'Cruz Solidaria' })
        .expect(200);
    });

    it('rechaza el nombre de otra organizacion', async () => {
      await request(ctx.app.getHttpServer())
        .put(`${BASE}/organizaciones/${ORG_ONG}`)
        .set('Authorization', comoUsuario(tokenCoordinador))
        .send({ ...cambios, nombre: 'Bomberos Voluntarios de Test' })
        .expect(400);
    });

    it('devuelve 404 si no existe', async () => {
      await request(ctx.app.getHttpServer())
        .put(`${BASE}/organizaciones/99999`)
        .set('Authorization', comoUsuario(tokenCoordinador))
        .send(cambios)
        .expect(404);
    });
  });

  describe('DELETE /organizaciones/:id', () => {
    /**
     * Dejar usuarios colgando de una organizacion inactiva los convierte en
     * gente que puede entrar al sistema pero no operar sobre nada, que es
     * peor que no poder entrar.
     */
    it('no deja dar de baja una organizacion con usuarios activos', async () => {
      const res = await request(ctx.app.getHttpServer())
        .delete(`${BASE}/organizaciones/${ORG_ONG}`)
        .set('Authorization', comoUsuario(tokenCoordinador))
        .expect(400);

      expect(res.body.message).toContain('usuario(s) activo(s)');
    });

    it('permite la baja cuando no le queda nadie', async () => {
      await request(ctx.app.getHttpServer())
        .delete(`${BASE}/organizaciones/${ORG_RESCATE}`)
        .set('Authorization', comoUsuario(tokenCoordinador))
        .expect(204);

      const enBase = await ctx.prisma.organizacion.findUnique({ where: { id: ORG_RESCATE } });
      expect(enBase).not.toBeNull();
      expect(enBase?.activo).toBe(false);
    });

    it('la organizacion dada de baja deja de aparecer y devuelve 404', async () => {
      await request(ctx.app.getHttpServer())
        .delete(`${BASE}/organizaciones/${ORG_RESCATE}`)
        .set('Authorization', comoUsuario(tokenCoordinador))
        .expect(204);

      await request(ctx.app.getHttpServer())
        .get(`${BASE}/organizaciones/${ORG_RESCATE}`)
        .set('Authorization', comoUsuario(tokenCoordinador))
        .expect(404);
    });

    it('deja de baja a los usuarios primero y entonces si permite la baja', async () => {
      await ctx.prisma.usuario.update({ where: { id: 3 }, data: { activo: false } });

      await request(ctx.app.getHttpServer())
        .delete(`${BASE}/organizaciones/${ORG_ONG}`)
        .set('Authorization', comoUsuario(tokenCoordinador))
        .expect(204);
    });
  });
});
