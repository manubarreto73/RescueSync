import request from 'supertest';
import { BASE, comoUsuario, login } from './helpers/auth';
import {
  ID_AUDITOR,
  ID_COORDINADOR,
  ID_ONG,
  ORG_MUNICIPIO,
  ORG_ONG,
  ORG_RESCATE,
  PASSWORD_TEST,
  resetearEstado,
} from './helpers/db';
import { cerrarApp, crearAppDeTest, TestContext } from './helpers/test-app';

describe('Usuarios (e2e)', () => {
  let ctx: TestContext;
  let tokenCoordinador: string;
  let tokenAuditor: string;
  let tokenOng: string;

  beforeAll(async () => {
    ctx = await crearAppDeTest();
  });

  beforeEach(async () => {
    await resetearEstado(ctx);

    // Los tokens se piden despues de resetear: el reset trunca la tabla, asi
    // que un token del test anterior apuntaria a un id que ya no existe.
    tokenCoordinador = (await login(ctx.app, 'coordinador@test.ar')).accessToken;
    tokenAuditor = (await login(ctx.app, 'auditor@test.ar')).accessToken;
    tokenOng = (await login(ctx.app, 'ong@test.ar')).accessToken;
  });

  afterAll(async () => {
    await cerrarApp(ctx);
  });

  const nuevoUsuario = {
    email: 'nueva.ong@test.ar',
    password: 'Rescue2026!',
    nombreCompleto: 'Manos Unidas - Pedro Ruiz',
    telefono: '+54 9 351 555-0100',
    rol: 'REPRESENTANTE_ONG',
    organizacionId: ORG_RESCATE,
  };

  describe('RBAC', () => {
    /**
     * La matriz de permisos completa en un solo test parametrizado.
     *
     * Esto es lo que mas se rompe sin darse cuenta: agregas un endpoint, te
     * olvidas el @Roles, y queda abierto a todos los perfiles. Un test asi lo
     * detecta el mismo dia.
     */
    it.each([
      ['POST /usuarios', 'post', '/usuarios', 'coordinador', 201],
      ['POST /usuarios', 'post', '/usuarios', 'auditor', 403],
      ['POST /usuarios', 'post', '/usuarios', 'ong', 403],
      ['GET /usuarios', 'get', '/usuarios', 'coordinador', 200],
      ['GET /usuarios', 'get', '/usuarios', 'auditor', 200],
      ['GET /usuarios', 'get', '/usuarios', 'ong', 403],
    ] as const)('%s (%s %s) como %s -> %i', async (_nombre, metodo, ruta, perfil, esperado) => {
      const tokens = { coordinador: tokenCoordinador, auditor: tokenAuditor, ong: tokenOng };

      const req = request(ctx.app.getHttpServer())
        [metodo](`${BASE}${ruta}`)
        .set('Authorization', comoUsuario(tokens[perfil]));

      if (metodo === 'post') req.send(nuevoUsuario);

      await req.expect(esperado);
    });

    /**
     * 401 y 403 no son lo mismo y conviene que el test lo deje escrito:
     * 401 es "no se quien sos", 403 es "se quien sos y no podes".
     */
    it('sin token devuelve 401, no 403', async () => {
      await request(ctx.app.getHttpServer()).get(`${BASE}/usuarios`).expect(401);
    });
  });

  describe('POST /usuarios', () => {
    it('crea el usuario y lo devuelve sin el hash', async () => {
      const res = await request(ctx.app.getHttpServer())
        .post(`${BASE}/usuarios`)
        .set('Authorization', comoUsuario(tokenCoordinador))
        .send(nuevoUsuario)
        .expect(201);

      expect(res.body).toMatchObject({
        email: 'nueva.ong@test.ar',
        nombreCompleto: 'Manos Unidas - Pedro Ruiz',
        rol: 'REPRESENTANTE_ONG',
        activo: true,
      });
      expect(res.body).not.toHaveProperty('password');
    });

    it('guarda la contrasena hasheada, nunca en claro', async () => {
      await request(ctx.app.getHttpServer())
        .post(`${BASE}/usuarios`)
        .set('Authorization', comoUsuario(tokenCoordinador))
        .send(nuevoUsuario)
        .expect(201);

      const enBase = await ctx.prisma.usuario.findUnique({
        where: { email: 'nueva.ong@test.ar' },
      });

      expect(enBase?.password).not.toBe(nuevoUsuario.password);
      expect(enBase?.password).toMatch(/^\$2[aby]\$/);
    });

    it('el usuario creado puede loguearse', async () => {
      await request(ctx.app.getHttpServer())
        .post(`${BASE}/usuarios`)
        .set('Authorization', comoUsuario(tokenCoordinador))
        .send(nuevoUsuario)
        .expect(201);

      const sesion = await login(ctx.app, 'nueva.ong@test.ar', nuevoUsuario.password);
      expect(sesion.accessToken).toEqual(expect.any(String));
    });

    it('rechaza un email ya registrado', async () => {
      const res = await request(ctx.app.getHttpServer())
        .post(`${BASE}/usuarios`)
        .set('Authorization', comoUsuario(tokenCoordinador))
        .send({ ...nuevoUsuario, email: 'ong@test.ar' })
        .expect(400);

      expect(res.body.message).toContain('Ya existe un usuario');
    });

    it('normaliza el email a minusculas', async () => {
      const res = await request(ctx.app.getHttpServer())
        .post(`${BASE}/usuarios`)
        .set('Authorization', comoUsuario(tokenCoordinador))
        .send({ ...nuevoUsuario, email: '  NUEVA.ONG@Test.AR ' })
        .expect(201);

      expect(res.body.email).toBe('nueva.ong@test.ar');
    });

    it('acepta que el telefono sea opcional', async () => {
      const { telefono: _telefono, ...sinTelefono } = nuevoUsuario;

      const res = await request(ctx.app.getHttpServer())
        .post(`${BASE}/usuarios`)
        .set('Authorization', comoUsuario(tokenCoordinador))
        .send(sinTelefono)
        .expect(201);

      expect(res.body.telefono).toBeNull();
    });

    it.each([
      ['password sin mayuscula', { password: 'rescue2026!' }],
      ['password sin numero', { password: 'RescueRescue!' }],
      ['password muy corta', { password: 'Ab1!' }],
      ['email invalido', { email: 'arroba-falta.test.ar' }],
      ['rol inexistente', { rol: 'PRESIDENTE' }],
      ['nombre muy corto', { nombreCompleto: 'AB' }],
    ])('rechaza con 400: %s', async (_caso, sobrescribe) => {
      await request(ctx.app.getHttpServer())
        .post(`${BASE}/usuarios`)
        .set('Authorization', comoUsuario(tokenCoordinador))
        .send({ ...nuevoUsuario, ...sobrescribe })
        .expect(400);
    });

    it('rechaza campos que el DTO no declara', async () => {
      const res = await request(ctx.app.getHttpServer())
        .post(`${BASE}/usuarios`)
        .set('Authorization', comoUsuario(tokenCoordinador))
        .send({ ...nuevoUsuario, activo: false, id: 99 })
        .expect(400);

      expect(res.body.message.join(' ')).toContain('should not exist');
    });
  });

  /**
   * Coherencia entre el perfil y la organizacion que lo respalda.
   *
   * La foreign key sabe que la organizacion existe, pero no que un
   * REPRESENTANTE_ONG no puede colgar de un MUNICIPIO. Si se colara, ese
   * usuario tendria permisos de ONG sobre los datos de un municipio.
   */
  describe('Pertenencia a una organizacion', () => {
    const crear = (body: Record<string, unknown>) =>
      request(ctx.app.getHttpServer())
        .post(`${BASE}/usuarios`)
        .set('Authorization', comoUsuario(tokenCoordinador))
        .send(body);

    it('acepta un representante de ONG en una ONG', async () => {
      await crear({ ...nuevoUsuario, organizacionId: ORG_ONG }).expect(201);
    });

    it('acepta un representante de ONG en un organismo de rescate', async () => {
      await crear({ ...nuevoUsuario, organizacionId: ORG_RESCATE }).expect(201);
    });

    it('rechaza un representante de ONG colgado de un municipio', async () => {
      const res = await crear({ ...nuevoUsuario, organizacionId: ORG_MUNICIPIO }).expect(400);
      expect(res.body.message).toContain('requiere ONG o ORGANISMO_RESCATE');
    });

    it('rechaza un operador municipal colgado de una ONG', async () => {
      const res = await crear({
        ...nuevoUsuario,
        rol: 'OPERADOR_MUNICIPAL',
        organizacionId: ORG_ONG,
      }).expect(400);

      expect(res.body.message).toContain('requiere MUNICIPIO');
    });

    it('exige organizacion a los perfiles que la necesitan', async () => {
      const { organizacionId: _sin, ...sinOrganizacion } = nuevoUsuario;

      const res = await crear(sinOrganizacion).expect(400);
      expect(res.body.message).toContain('debe pertenecer a una organizacion');
    });

    it.each([['CENTRO_COORDINADOR'], ['AUDITOR']])(
      'permite que un %s no pertenezca a ninguna',
      async (rol) => {
        const { organizacionId: _sin, ...sinOrganizacion } = nuevoUsuario;

        await crear({ ...sinOrganizacion, rol }).expect(201);
      },
    );

    it.each([['CENTRO_COORDINADOR'], ['AUDITOR']])(
      'rechaza que un %s pertenezca a una organizacion de la red',
      async (rol) => {
        const res = await crear({ ...nuevoUsuario, rol, organizacionId: ORG_ONG }).expect(400);
        expect(res.body.message).toContain('no pertenece a ninguna organizacion');
      },
    );

    it('devuelve 404 si la organizacion no existe', async () => {
      await crear({ ...nuevoUsuario, organizacionId: 99999 }).expect(404);
    });

    it('devuelve 404 si la organizacion esta dada de baja', async () => {
      await ctx.prisma.organizacion.update({
        where: { id: ORG_RESCATE },
        data: { activo: false },
      });

      await crear({ ...nuevoUsuario, organizacionId: ORG_RESCATE }).expect(404);
    });

    it('expone la organizacion en la respuesta', async () => {
      const res = await crear(nuevoUsuario).expect(201);
      expect(res.body.organizacionId).toBe(ORG_RESCATE);
    });
  });

  describe('GET /usuarios', () => {
    it('devuelve la pagina con su metadata', async () => {
      const res = await request(ctx.app.getHttpServer())
        .get(`${BASE}/usuarios`)
        .set('Authorization', comoUsuario(tokenCoordinador))
        .expect(200);

      expect(res.body).toMatchObject({ page: 0, size: 20, totalElements: 4, totalPages: 1 });
      expect(res.body.content).toHaveLength(4);
    });

    it('pagina correctamente', async () => {
      const res = await request(ctx.app.getHttpServer())
        .get(`${BASE}/usuarios?page=1&size=3`)
        .set('Authorization', comoUsuario(tokenCoordinador))
        .expect(200);

      expect(res.body.totalPages).toBe(2);
      expect(res.body.content).toHaveLength(1);
    });

    it('filtra por rol', async () => {
      const res = await request(ctx.app.getHttpServer())
        .get(`${BASE}/usuarios?rol=AUDITOR`)
        .set('Authorization', comoUsuario(tokenCoordinador))
        .expect(200);

      expect(res.body.totalElements).toBe(1);
      expect(res.body.content[0].email).toBe('auditor@test.ar');
    });

    it('busca por nombre sin distinguir mayusculas', async () => {
      const res = await request(ctx.app.getHttpServer())
        .get(`${BASE}/usuarios?busqueda=SOSA`)
        .set('Authorization', comoUsuario(tokenCoordinador))
        .expect(200);

      expect(res.body.content.map((u: { email: string }) => u.email)).toEqual([
        'coordinador@test.ar',
      ]);
    });

    it('no incluye usuarios dados de baja', async () => {
      await ctx.prisma.usuario.update({ where: { id: ID_ONG }, data: { activo: false } });

      const res = await request(ctx.app.getHttpServer())
        .get(`${BASE}/usuarios`)
        .set('Authorization', comoUsuario(tokenCoordinador))
        .expect(200);

      expect(res.body.totalElements).toBe(3);
    });

    it.each([
      ['size mayor al maximo', 'size=500'],
      ['page negativa', 'page=-1'],
      ['rol inexistente', 'rol=PRESIDENTE'],
      ['size no numerico', 'size=muchos'],
    ])('rechaza con 400: %s', async (_caso, query) => {
      await request(ctx.app.getHttpServer())
        .get(`${BASE}/usuarios?${query}`)
        .set('Authorization', comoUsuario(tokenCoordinador))
        .expect(400);
    });
  });

  describe('GET /usuarios/:id', () => {
    it('devuelve el usuario pedido', async () => {
      const res = await request(ctx.app.getHttpServer())
        .get(`${BASE}/usuarios/${ID_ONG}`)
        .set('Authorization', comoUsuario(tokenCoordinador))
        .expect(200);

      expect(res.body.email).toBe('ong@test.ar');
    });

    it('devuelve 404 si no existe', async () => {
      await request(ctx.app.getHttpServer())
        .get(`${BASE}/usuarios/99999`)
        .set('Authorization', comoUsuario(tokenCoordinador))
        .expect(404);
    });

    it('devuelve 404 si esta dado de baja', async () => {
      await ctx.prisma.usuario.update({ where: { id: ID_ONG }, data: { activo: false } });

      await request(ctx.app.getHttpServer())
        .get(`${BASE}/usuarios/${ID_ONG}`)
        .set('Authorization', comoUsuario(tokenCoordinador))
        .expect(404);
    });

    // ParseIntPipe: un id no numerico es 400, no 404. Son errores distintos:
    // "pediste mal" contra "no esta".
    it('devuelve 400 si el id no es un numero', async () => {
      await request(ctx.app.getHttpServer())
        .get(`${BASE}/usuarios/abc`)
        .set('Authorization', comoUsuario(tokenCoordinador))
        .expect(400);
    });
  });

  describe('PUT /usuarios/:id', () => {
    const cambios = {
      email: 'ong.actualizada@test.ar',
      nombreCompleto: 'Ana Diaz (actualizado)',
      telefono: '+54 9 351 555-9999',
      rol: 'REPRESENTANTE_ONG',
      organizacionId: ORG_ONG,
    };

    it('actualiza todos los campos editables', async () => {
      const res = await request(ctx.app.getHttpServer())
        .put(`${BASE}/usuarios/${ID_ONG}`)
        .set('Authorization', comoUsuario(tokenCoordinador))
        .send(cambios)
        .expect(200);

      expect(res.body).toMatchObject(cambios);
    });

    it('permite dejar el mismo email sin chocar consigo mismo', async () => {
      await request(ctx.app.getHttpServer())
        .put(`${BASE}/usuarios/${ID_ONG}`)
        .set('Authorization', comoUsuario(tokenCoordinador))
        .send({ ...cambios, email: 'ong@test.ar' })
        .expect(200);
    });

    it('rechaza el email de otro usuario', async () => {
      await request(ctx.app.getHttpServer())
        .put(`${BASE}/usuarios/${ID_ONG}`)
        .set('Authorization', comoUsuario(tokenCoordinador))
        .send({ ...cambios, email: 'auditor@test.ar' })
        .expect(400);
    });

    it('devuelve 404 si el usuario no existe', async () => {
      await request(ctx.app.getHttpServer())
        .put(`${BASE}/usuarios/99999`)
        .set('Authorization', comoUsuario(tokenCoordinador))
        .send(cambios)
        .expect(404);
    });

    it('no toca la contrasena', async () => {
      const antes = await ctx.prisma.usuario.findUnique({ where: { id: ID_ONG } });

      await request(ctx.app.getHttpServer())
        .put(`${BASE}/usuarios/${ID_ONG}`)
        .set('Authorization', comoUsuario(tokenCoordinador))
        .send(cambios)
        .expect(200);

      const despues = await ctx.prisma.usuario.findUnique({ where: { id: ID_ONG } });
      expect(despues?.password).toBe(antes?.password);
    });
  });

  describe('PATCH /usuarios/me/password', () => {
    it('cambia la contrasena del usuario autenticado', async () => {
      await request(ctx.app.getHttpServer())
        .patch(`${BASE}/usuarios/me/password`)
        .set('Authorization', comoUsuario(tokenOng))
        .send({ passwordActual: PASSWORD_TEST, passwordNueva: 'NuevaClave2026!' })
        .expect(204);

      await login(ctx.app, 'ong@test.ar', 'NuevaClave2026!');
    });

    it('la contrasena vieja deja de servir', async () => {
      await request(ctx.app.getHttpServer())
        .patch(`${BASE}/usuarios/me/password`)
        .set('Authorization', comoUsuario(tokenOng))
        .send({ passwordActual: PASSWORD_TEST, passwordNueva: 'NuevaClave2026!' })
        .expect(204);

      await request(ctx.app.getHttpServer())
        .post(`${BASE}/auth/login`)
        .send({ email: 'ong@test.ar', password: PASSWORD_TEST })
        .expect(401);
    });

    it('exige conocer la contrasena actual', async () => {
      const res = await request(ctx.app.getHttpServer())
        .patch(`${BASE}/usuarios/me/password`)
        .set('Authorization', comoUsuario(tokenOng))
        .send({ passwordActual: 'NoEsLaActual1', passwordNueva: 'NuevaClave2026!' })
        .expect(400);

      expect(res.body.message).toContain('actual es incorrecta');
    });

    it('no permite repetir la misma contrasena', async () => {
      const res = await request(ctx.app.getHttpServer())
        .patch(`${BASE}/usuarios/me/password`)
        .set('Authorization', comoUsuario(tokenOng))
        .send({ passwordActual: PASSWORD_TEST, passwordNueva: PASSWORD_TEST })
        .expect(400);

      expect(res.body.message).toContain('distinta de la actual');
    });

    it('exige que la nueva cumpla la politica de complejidad', async () => {
      await request(ctx.app.getHttpServer())
        .patch(`${BASE}/usuarios/me/password`)
        .set('Authorization', comoUsuario(tokenOng))
        .send({ passwordActual: PASSWORD_TEST, passwordNueva: 'todominusculas' })
        .expect(400);
    });
  });

  describe('PATCH /usuarios/me (autogestion)', () => {
    it('cualquier perfil puede editar sus propios datos', async () => {
      const res = await request(ctx.app.getHttpServer())
        .patch(`${BASE}/usuarios/me`)
        .set('Authorization', comoUsuario(tokenOng))
        .send({ nombreCompleto: 'Ana Diaz Lopez', telefono: '+54 9 351 555-7777' })
        .expect(200);

      expect(res.body).toMatchObject({
        id: ID_ONG,
        nombreCompleto: 'Ana Diaz Lopez',
        telefono: '+54 9 351 555-7777',
      });
    });

    it('edita al usuario del token, no al de la URL', async () => {
      await request(ctx.app.getHttpServer())
        .patch(`${BASE}/usuarios/me`)
        .set('Authorization', comoUsuario(tokenOng))
        .send({ nombreCompleto: 'Ana Diaz Lopez' })
        .expect(200);

      const otro = await ctx.prisma.usuario.findUnique({ where: { id: ID_AUDITOR } });
      expect(otro?.nombreCompleto).toBe('Jorge Medina');
    });

    it('permite borrar el telefono mandandolo nulo', async () => {
      const res = await request(ctx.app.getHttpServer())
        .patch(`${BASE}/usuarios/me`)
        .set('Authorization', comoUsuario(tokenOng))
        .send({ nombreCompleto: 'Ana Diaz' })
        .expect(200);

      expect(res.body.telefono).toBeNull();
    });

    /**
     * El test mas importante de este bloque: si un usuario pudiera editarse
     * el rol, se haria CENTRO_COORDINADOR y el RBAC entero dejaria de valer.
     */
    it('no deja escalar privilegios cambiandose el rol', async () => {
      const res = await request(ctx.app.getHttpServer())
        .patch(`${BASE}/usuarios/me`)
        .set('Authorization', comoUsuario(tokenOng))
        .send({ nombreCompleto: 'Ana Diaz', rol: 'CENTRO_COORDINADOR' })
        .expect(400);

      expect(res.body.message.join(' ')).toContain('property rol should not exist');

      const enBase = await ctx.prisma.usuario.findUnique({ where: { id: ID_ONG } });
      expect(enBase?.rol).toBe('REPRESENTANTE_ONG');
    });

    it.each([
      ['email', { email: 'otro@test.ar' }],
      ['activo', { activo: true }],
      ['password', { password: 'Rescue2026!' }],
      ['id', { id: 99 }],
    ])('rechaza que se edite %s por esta via', async (_campo, extra) => {
      await request(ctx.app.getHttpServer())
        .patch(`${BASE}/usuarios/me`)
        .set('Authorization', comoUsuario(tokenOng))
        .send({ nombreCompleto: 'Ana Diaz', ...extra })
        .expect(400);
    });

    it('exige estar autenticado', async () => {
      await request(ctx.app.getHttpServer())
        .patch(`${BASE}/usuarios/me`)
        .send({ nombreCompleto: 'Cualquiera' })
        .expect(401);
    });
  });

  describe('DELETE /usuarios/me (baja propia)', () => {
    it('cualquier perfil puede darse de baja', async () => {
      await request(ctx.app.getHttpServer())
        .delete(`${BASE}/usuarios/me`)
        .set('Authorization', comoUsuario(tokenOng))
        .expect(204);

      const enBase = await ctx.prisma.usuario.findUnique({ where: { id: ID_ONG } });
      expect(enBase?.activo).toBe(false);
    });

    /**
     * Sin revocacion, la baja no tendria efecto inmediato: el access token es
     * un JWT ya firmado y seguiria siendo valido los 15 minutos que le queden
     * de vida, aunque la cuenta ya no exista para la app.
     */
    it('corta la sesion en el acto, sin esperar a que expire el token', async () => {
      await request(ctx.app.getHttpServer())
        .get(`${BASE}/auth/me`)
        .set('Authorization', comoUsuario(tokenOng))
        .expect(200);

      await request(ctx.app.getHttpServer())
        .delete(`${BASE}/usuarios/me`)
        .set('Authorization', comoUsuario(tokenOng))
        .expect(204);

      await request(ctx.app.getHttpServer())
        .get(`${BASE}/auth/me`)
        .set('Authorization', comoUsuario(tokenOng))
        .expect(401);
    });

    it('el usuario dado de baja ya no puede volver a entrar', async () => {
      await request(ctx.app.getHttpServer())
        .delete(`${BASE}/usuarios/me`)
        .set('Authorization', comoUsuario(tokenOng))
        .expect(204);

      await request(ctx.app.getHttpServer())
        .post(`${BASE}/auth/login`)
        .send({ email: 'ong@test.ar', password: PASSWORD_TEST })
        .expect(401);
    });

    it('un coordinador tambien puede darse de baja por esta via', async () => {
      await request(ctx.app.getHttpServer())
        .delete(`${BASE}/usuarios/me`)
        .set('Authorization', comoUsuario(tokenCoordinador))
        .expect(204);

      const enBase = await ctx.prisma.usuario.findUnique({ where: { id: ID_COORDINADOR } });
      expect(enBase?.activo).toBe(false);
    });

    it('no toca a ningun otro usuario', async () => {
      await request(ctx.app.getHttpServer())
        .delete(`${BASE}/usuarios/me`)
        .set('Authorization', comoUsuario(tokenOng))
        .expect(204);

      const activos = await ctx.prisma.usuario.count({ where: { activo: true } });
      expect(activos).toBe(3);
    });

    it('exige estar autenticado', async () => {
      await request(ctx.app.getHttpServer()).delete(`${BASE}/usuarios/me`).expect(401);
    });
  });

  describe('DELETE /usuarios/:id (baja administrativa)', () => {
    it('da de baja logica: desaparece de la API pero la fila queda', async () => {
      await request(ctx.app.getHttpServer())
        .delete(`${BASE}/usuarios/${ID_ONG}`)
        .set('Authorization', comoUsuario(tokenCoordinador))
        .expect(204);

      await request(ctx.app.getHttpServer())
        .get(`${BASE}/usuarios/${ID_ONG}`)
        .set('Authorization', comoUsuario(tokenCoordinador))
        .expect(404);

      // La trazabilidad es el motivo del soft delete: las emergencias y
      // ofertas que cargo este usuario tienen que seguir siendo auditables.
      const enBase = await ctx.prisma.usuario.findUnique({ where: { id: ID_ONG } });
      expect(enBase).not.toBeNull();
      expect(enBase?.activo).toBe(false);
    });

    it('deriva la baja propia al endpoint de autogestion', async () => {
      const res = await request(ctx.app.getHttpServer())
        .delete(`${BASE}/usuarios/${ID_COORDINADOR}`)
        .set('Authorization', comoUsuario(tokenCoordinador))
        .expect(400);

      expect(res.body.message).toContain('DELETE /usuarios/me');
    });

    it('corta en el acto las sesiones del usuario dado de baja', async () => {
      await request(ctx.app.getHttpServer())
        .delete(`${BASE}/usuarios/${ID_ONG}`)
        .set('Authorization', comoUsuario(tokenCoordinador))
        .expect(204);

      // El token de la ONG se emitio antes de la baja y todavia no expiro.
      await request(ctx.app.getHttpServer())
        .get(`${BASE}/auth/me`)
        .set('Authorization', comoUsuario(tokenOng))
        .expect(401);
    });

    it('devuelve 404 si el usuario no existe', async () => {
      await request(ctx.app.getHttpServer())
        .delete(`${BASE}/usuarios/99999`)
        .set('Authorization', comoUsuario(tokenCoordinador))
        .expect(404);
    });

    it('el usuario dado de baja ya no puede loguearse', async () => {
      await request(ctx.app.getHttpServer())
        .delete(`${BASE}/usuarios/${ID_AUDITOR}`)
        .set('Authorization', comoUsuario(tokenCoordinador))
        .expect(204);

      await request(ctx.app.getHttpServer())
        .post(`${BASE}/auth/login`)
        .send({ email: 'auditor@test.ar', password: PASSWORD_TEST })
        .expect(401);
    });
  });
});
