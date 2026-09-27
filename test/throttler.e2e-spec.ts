import request from 'supertest';
import { BASE } from './helpers/auth';
import { PASSWORD_TEST, resetearEstado } from './helpers/db';
import { cerrarApp, crearAppDeTest, TestContext } from './helpers/test-app';

/**
 * El unico spec que corre con el rate limiting ENCENDIDO.
 *
 * Va en su propio archivo justamente por eso: si estuviera mezclado con los
 * demas, cada request que hacen esos tests contaria contra el limite y
 * empezarian a fallar por motivos que no tienen que ver con lo que prueban.
 */
describe('Rate limiting (e2e)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await crearAppDeTest({ throttling: true });
  });

  beforeEach(async () => {
    // Vaciar Redis resetea los contadores del throttler: cada test arranca
    // con la cuota entera.
    await resetearEstado(ctx);
  });

  afterAll(async () => {
    await cerrarApp(ctx);
  });

  const credencialesMalas = { email: 'nadie@test.ar', password: 'LoQueSea2026' };

  it('deja pasar 3 intentos de login y corta el cuarto con 429', async () => {
    const codigos: number[] = [];

    for (let i = 0; i < 4; i++) {
      const res = await request(ctx.app.getHttpServer())
        .post(`${BASE}/auth/login`)
        .send(credencialesMalas);
      codigos.push(res.status);
    }

    expect(codigos.slice(0, 3)).toEqual([401, 401, 401]);
    expect(codigos[3]).toBe(429);
  });

  it('el 429 explica el motivo', async () => {
    for (let i = 0; i < 3; i++) {
      await request(ctx.app.getHttpServer()).post(`${BASE}/auth/login`).send(credencialesMalas);
    }

    const res = await request(ctx.app.getHttpServer())
      .post(`${BASE}/auth/login`)
      .send(credencialesMalas)
      .expect(429);

    expect(res.body.message).toContain('Demasiadas peticiones');
  });

  /**
   * Este test es el que justifica haber puesto el storage en Redis.
   *
   * Con el contador en la memoria del proceso, dos replicas de la API detras
   * de un balanceador dejarian pasar el doble del limite configurado, porque
   * cada una llevaria su propia cuenta. Verificar que la clave existe en
   * Redis es verificar que el limite es realmente compartido.
   */
  it('lleva el contador en Redis y no en la memoria del proceso', async () => {
    await request(ctx.app.getHttpServer()).post(`${BASE}/auth/login`).send(credencialesMalas);

    const claves = await ctx.redis.keys('*');
    const contadores = claves.filter((k) => k.includes(':hits'));

    expect(contadores.length).toBeGreaterThan(0);
  });

  it('el healthcheck esta exento: Docker lo consulta cada 10 segundos', async () => {
    for (let i = 0; i < 8; i++) {
      await request(ctx.app.getHttpServer()).get(`${BASE}/health`).expect(200);
    }
  });

  it('un login valido tambien consume cuota: el limite es por transporte', async () => {
    const codigos: number[] = [];

    for (let i = 0; i < 4; i++) {
      const res = await request(ctx.app.getHttpServer())
        .post(`${BASE}/auth/login`)
        .send({ email: 'coordinador@test.ar', password: PASSWORD_TEST });
      codigos.push(res.status);
    }

    expect(codigos.slice(0, 3)).toEqual([200, 200, 200]);
    expect(codigos[3]).toBe(429);
  });
});
