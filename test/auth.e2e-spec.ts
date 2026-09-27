import request from 'supertest';
import { BASE, comoUsuario, login } from './helpers/auth';
import { ORG_ONG, PASSWORD_TEST, resetearEstado } from './helpers/db';
import { cerrarApp, crearAppDeTest, TestContext } from './helpers/test-app';

/**
 * Tests e2e de autenticacion.
 *
 * "e2e" quiere decir que entran por HTTP y salen por la base: no hay mocks.
 * Se prueba lo mismo que probarias a mano con Postman, pero automatizado y
 * partiendo siempre del mismo estado.
 *
 * Anatomia de un test con Jest:
 *   describe(...)  agrupa, como una @Nested class de JUnit
 *   it(...)        un caso, como un @Test
 *   beforeEach     como @BeforeEach
 *   expect(x).toBe(y)  como assertEquals(y, x) — ojo el orden invertido
 */
describe('Auth (e2e)', () => {
  let ctx: TestContext;

  // beforeAll: levantar la app es caro (arma todo el contenedor de DI),
  // asi que se hace una sola vez por archivo.
  beforeAll(async () => {
    ctx = await crearAppDeTest();
  });

  // beforeEach: el estado de los datos si se resetea en cada test.
  beforeEach(async () => {
    await resetearEstado(ctx);
  });

  afterAll(async () => {
    await cerrarApp(ctx);
  });

  describe('POST /auth/login', () => {
    it('devuelve los dos tokens y el usuario con credenciales validas', async () => {
      const res = await request(ctx.app.getHttpServer())
        .post(`${BASE}/auth/login`)
        .send({ email: 'coordinador@test.ar', password: PASSWORD_TEST })
        .expect(200);

      expect(res.body.accessToken).toEqual(expect.any(String));
      expect(res.body.refreshToken).toEqual(expect.any(String));
      expect(res.body.tokenType).toBe('Bearer');
      expect(res.body.expiresIn).toBe(900);
      expect(res.body.usuario).toMatchObject({
        email: 'coordinador@test.ar',
        rol: 'CENTRO_COORDINADOR',
        activo: true,
      });
    });

    // Este test vale mas que la mayoria: una filtracion de hashes no rompe
    // nada visible, asi que sin un test nadie se entera hasta que es tarde.
    it('nunca expone el hash de la contrasena', async () => {
      const res = await request(ctx.app.getHttpServer())
        .post(`${BASE}/auth/login`)
        .send({ email: 'coordinador@test.ar', password: PASSWORD_TEST })
        .expect(200);

      expect(res.body.usuario).not.toHaveProperty('password');
      expect(JSON.stringify(res.body)).not.toContain('$2a$');
    });

    it('normaliza el email: acepta mayusculas y espacios', async () => {
      await request(ctx.app.getHttpServer())
        .post(`${BASE}/auth/login`)
        .send({ email: '  COORDINADOR@test.ar  ', password: PASSWORD_TEST })
        .expect(200);
    });

    it('rechaza una contrasena incorrecta con 401', async () => {
      const res = await request(ctx.app.getHttpServer())
        .post(`${BASE}/auth/login`)
        .send({ email: 'coordinador@test.ar', password: 'PasswordIncorrecta1' })
        .expect(401);

      expect(res.body.message).toContain('Credenciales invalidas');
    });

    /**
     * El mensaje tiene que ser el mismo exista o no el usuario. Si dijera
     * "el usuario no existe", cualquiera podria averiguar que emails estan
     * registrados probando de a uno (enumeracion de usuarios).
     */
    it('da el mismo error para un usuario inexistente que para una password mala', async () => {
      const inexistente = await request(ctx.app.getHttpServer())
        .post(`${BASE}/auth/login`)
        .send({ email: 'nadie@test.ar', password: PASSWORD_TEST })
        .expect(401);

      expect(inexistente.body.message).toContain('Credenciales invalidas');
    });

    it('rechaza a un usuario dado de baja', async () => {
      await ctx.prisma.usuario.update({ where: { id: 2 }, data: { activo: false } });

      const res = await request(ctx.app.getHttpServer())
        .post(`${BASE}/auth/login`)
        .send({ email: 'coordinador@test.ar', password: PASSWORD_TEST })
        .expect(401);

      expect(res.body.message).toContain('dado de baja');
    });

    it('registra el ultimo acceso', async () => {
      const antes = await ctx.prisma.usuario.findUnique({ where: { id: 2 } });
      expect(antes?.ultimoAcceso).toBeNull();

      await login(ctx.app, 'coordinador@test.ar');

      const despues = await ctx.prisma.usuario.findUnique({ where: { id: 2 } });
      expect(despues?.ultimoAcceso).toBeInstanceOf(Date);
    });

    // it.each corre el mismo test con varios juegos de datos: es el
    // equivalente a @ParameterizedTest de JUnit.
    it.each([
      ['email con formato invalido', { email: 'no-es-email', password: PASSWORD_TEST }],
      ['sin password', { email: 'coordinador@test.ar' }],
      ['sin email', { password: PASSWORD_TEST }],
      ['password demasiado corta', { email: 'coordinador@test.ar', password: 'abc' }],
    ])('rechaza con 400: %s', async (_caso, body) => {
      await request(ctx.app.getHttpServer()).post(`${BASE}/auth/login`).send(body).expect(400);
    });

    it('rechaza propiedades que el DTO no declara', async () => {
      const res = await request(ctx.app.getHttpServer())
        .post(`${BASE}/auth/login`)
        .send({ email: 'coordinador@test.ar', password: PASSWORD_TEST, rol: 'AUDITOR' })
        .expect(400);

      expect(res.body.message).toContain('property rol should not exist');
    });
  });

  describe('POST /auth/refresh', () => {
    it('entrega un par nuevo y rota el refresh token', async () => {
      const sesion = await login(ctx.app, 'coordinador@test.ar');

      const res = await request(ctx.app.getHttpServer())
        .post(`${BASE}/auth/refresh`)
        .send({ refreshToken: sesion.refreshToken })
        .expect(200);

      expect(res.body.refreshToken).not.toBe(sesion.refreshToken);
      expect(res.body.accessToken).toEqual(expect.any(String));
    });

    /** El refresh es de un solo uso: esa es toda la gracia de la rotacion. */
    it('invalida el refresh token viejo despues de usarlo', async () => {
      const sesion = await login(ctx.app, 'coordinador@test.ar');

      await request(ctx.app.getHttpServer())
        .post(`${BASE}/auth/refresh`)
        .send({ refreshToken: sesion.refreshToken })
        .expect(200);

      await request(ctx.app.getHttpServer())
        .post(`${BASE}/auth/refresh`)
        .send({ refreshToken: sesion.refreshToken })
        .expect(401);
    });

    it('rechaza un refresh token inventado', async () => {
      await request(ctx.app.getHttpServer())
        .post(`${BASE}/auth/refresh`)
        .send({ refreshToken: 'a'.repeat(96) })
        .expect(401);
    });

    it('rechaza el refresh de un usuario dado de baja despues de loguearse', async () => {
      const sesion = await login(ctx.app, 'coordinador@test.ar');
      await ctx.prisma.usuario.update({ where: { id: 2 }, data: { activo: false } });

      await request(ctx.app.getHttpServer())
        .post(`${BASE}/auth/refresh`)
        .send({ refreshToken: sesion.refreshToken })
        .expect(401);
    });
  });

  describe('POST /auth/logout', () => {
    it('revoca el access token aunque todavia no haya expirado', async () => {
      const sesion = await login(ctx.app, 'coordinador@test.ar');

      await request(ctx.app.getHttpServer())
        .get(`${BASE}/auth/me`)
        .set('Authorization', comoUsuario(sesion.accessToken))
        .expect(200);

      await request(ctx.app.getHttpServer())
        .post(`${BASE}/auth/logout`)
        .set('Authorization', comoUsuario(sesion.accessToken))
        .send({ refreshToken: sesion.refreshToken })
        .expect(204);

      // El JWT sigue siendo criptograficamente valido; lo frena la blacklist.
      await request(ctx.app.getHttpServer())
        .get(`${BASE}/auth/me`)
        .set('Authorization', comoUsuario(sesion.accessToken))
        .expect(401);
    });

    it('tambien invalida el refresh token', async () => {
      const sesion = await login(ctx.app, 'coordinador@test.ar');

      await request(ctx.app.getHttpServer())
        .post(`${BASE}/auth/logout`)
        .set('Authorization', comoUsuario(sesion.accessToken))
        .send({ refreshToken: sesion.refreshToken })
        .expect(204);

      await request(ctx.app.getHttpServer())
        .post(`${BASE}/auth/refresh`)
        .send({ refreshToken: sesion.refreshToken })
        .expect(401);
    });

    it('exige estar autenticado', async () => {
      await request(ctx.app.getHttpServer()).post(`${BASE}/auth/logout`).send({}).expect(401);
    });
  });

  /**
   * Bloqueo de IP por intentos fallidos.
   *
   * Va en este archivo y no en throttler.e2e-spec.ts a proposito: son dos
   * mecanismos distintos y este spec corre con el throttler apagado, que es
   * justo lo que permite hacer los 5 intentos sin que el rate limit de
   * transporte corte antes en el tercero.
   */
  describe('Bloqueo de IP por intentos fallidos', () => {
    const fallar = () =>
      request(ctx.app.getHttpServer())
        .post(`${BASE}/auth/login`)
        .send({ email: 'coordinador@test.ar', password: 'PasswordIncorrecta1' });

    it('avisa cuantos intentos quedan, en singular y en plural', async () => {
      const primero = await fallar();
      expect(primero.body.message).toContain('Le quedan 4 intentos');

      await fallar();
      await fallar();
      const cuarto = await fallar();
      expect(cuarto.body.message).toContain('Le queda 1 intento');
    });

    it('bloquea la IP al quinto fallo', async () => {
      for (let i = 0; i < 4; i++) await fallar();

      const quinto = await fallar();
      expect(quinto.status).toBe(401);
      expect(quinto.body.message).toContain('bloqueada');
    });

    /**
     * Lo importante del bloqueo: una vez activo, ni siquiera las credenciales
     * correctas pasan. Si no fuera asi, no serviria de nada contra la fuerza
     * bruta, porque el atacante entra igual cuando acierta.
     */
    it('una vez bloqueada, rechaza incluso las credenciales correctas con 429', async () => {
      for (let i = 0; i < 5; i++) await fallar();

      const res = await request(ctx.app.getHttpServer())
        .post(`${BASE}/auth/login`)
        .send({ email: 'coordinador@test.ar', password: PASSWORD_TEST })
        .expect(429);

      expect(res.body.message).toContain('Reintente en 30 minutos');
    });

    it('un login exitoso limpia el contador de fallos', async () => {
      await fallar();
      await fallar();

      await login(ctx.app, 'coordinador@test.ar');

      // Si el contador no se hubiera reseteado, este diria "quedan 2".
      const despues = await fallar();
      expect(despues.body.message).toContain('Le quedan 4 intentos');
    });
  });

  describe('GET /auth/me', () => {
    it('devuelve el usuario del token', async () => {
      const sesion = await login(ctx.app, 'ong@test.ar');

      const res = await request(ctx.app.getHttpServer())
        .get(`${BASE}/auth/me`)
        .set('Authorization', comoUsuario(sesion.accessToken))
        .expect(200);

      expect(res.body).toMatchObject({
        id: sesion.usuarioId,
        email: 'ong@test.ar',
        rol: 'REPRESENTANTE_ONG',
      });
    });

    /**
     * organizacionId viaja en el token para poder acotar el acceso por filas
     * sin consultar la base en cada request.
     */
    it('incluye la organizacion del usuario', async () => {
      const sesion = await login(ctx.app, 'ong@test.ar');

      const claims = JSON.parse(Buffer.from(sesion.accessToken.split('.')[1], 'base64').toString());

      expect(claims.organizacionId).toBe(ORG_ONG);
      expect(claims.rol).toBe('REPRESENTANTE_ONG');
    });

    it('lleva la organizacion en null para los perfiles transversales', async () => {
      const sesion = await login(ctx.app, 'coordinador@test.ar');

      const claims = JSON.parse(Buffer.from(sesion.accessToken.split('.')[1], 'base64').toString());

      expect(claims.organizacionId).toBeNull();
    });

    // El JWT esta firmado, no cifrado: cualquiera que lo intercepte puede
    // leer sus claims. Por eso no va nada sensible adentro.
    it('no mete datos sensibles en los claims', async () => {
      const sesion = await login(ctx.app, 'ong@test.ar');

      const claims = JSON.parse(Buffer.from(sesion.accessToken.split('.')[1], 'base64').toString());

      expect(claims).not.toHaveProperty('password');
      expect(Object.keys(claims).sort()).toEqual(
        ['email', 'exp', 'iat', 'organizacionId', 'rol', 'sub'].sort(),
      );
    });

    it.each([
      ['sin header Authorization', undefined],
      ['con un token basura', 'Bearer no-es-un-jwt'],
      ['sin el prefijo Bearer', 'algo-suelto'],
    ])('devuelve 401 %s', async (_caso, header) => {
      const req = request(ctx.app.getHttpServer()).get(`${BASE}/auth/me`);
      if (header) req.set('Authorization', header);
      await req.expect(401);
    });
  });
});
