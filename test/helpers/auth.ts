import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PASSWORD_TEST } from './db';

export const BASE = '/api/v1';

export interface Sesion {
  accessToken: string;
  refreshToken: string;
  usuarioId: number;
}

/**
 * Hace login de verdad, por HTTP, y devuelve los tokens.
 *
 * Se podria atajar generando el JWT a mano con el TokenService, y seria mas
 * rapido. No se hace: si manana el login cambia (agrega un claim, valida algo
 * mas), un token fabricado a mano seguiria funcionando en los tests mientras
 * la app real se rompe. El helper pasa por la misma puerta que el usuario.
 */
export async function login(
  app: INestApplication,
  email: string,
  password: string = PASSWORD_TEST,
): Promise<Sesion> {
  const res = await request(app.getHttpServer())
    .post(`${BASE}/auth/login`)
    .send({ email, password });

  if (res.status !== 200) {
    throw new Error(`Login fallido para ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  }

  return {
    accessToken: res.body.accessToken,
    refreshToken: res.body.refreshToken,
    usuarioId: res.body.usuario.id,
  };
}

/** Azucar para no repetir el header en cada request. */
export function comoUsuario(token: string): string {
  return `Bearer ${token}`;
}
