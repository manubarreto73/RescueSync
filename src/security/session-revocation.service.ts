import { Injectable } from '@nestjs/common';
import { RedisKeys } from '../redis/redis.keys';
import { RedisService } from '../redis/redis.service';
import { TokenService } from './token.service';

/**
 * Revocacion de sesiones activas.
 *
 * Existe porque un JWT no se puede "apagar": una vez firmado es valido hasta
 * que expira, y el servidor no lo consulta en ningun lado. Para poder cortar
 * una sesion antes de tiempo hay que llevar una lista de lo revocado, y eso
 * vive en Redis.
 *
 * Hay dos granularidades, y se usan en momentos distintos:
 *
 *   revocarAccessToken  un token puntual (logout). Se sabe cual es porque
 *                       viene en el header del request.
 *   revocarUsuario      todos los tokens de una persona a la vez (baja). No
 *                       hace falta conocerlos: se marca el id y el guard los
 *                       rechaza a todos.
 *
 * Vive en security/ y no dentro de auth/ para que usuarios/ pueda usarlo sin
 * depender del modulo de auth, que a su vez depende de usuarios: eso seria
 * una dependencia circular.
 */
@Injectable()
export class SessionRevocationService {
  constructor(
    private readonly redis: RedisService,
    private readonly tokenService: TokenService,
  ) {}

  /** Logout: invalida este access token por el tiempo que le quedaba. */
  async revocarAccessToken(accessToken: string): Promise<void> {
    const payload = this.tokenService.decode(accessToken);

    if (!payload?.exp) return;

    const segundosRestantes = payload.exp - Math.floor(Date.now() / 1000);

    // Un token ya vencido no necesita entrar en la lista: verificarlo ya
    // devuelve 401 por expiracion, y Redis lo borraria enseguida igual.
    if (segundosRestantes > 0) {
      await this.redis.set(RedisKeys.blacklist(accessToken), '1', segundosRestantes);
    }
  }

  /** Baja de usuario: invalida todas sus sesiones abiertas de una. */
  async revocarUsuario(usuarioId: number): Promise<void> {
    await this.redis.set(
      RedisKeys.usuarioRevocado(usuarioId),
      '1',
      this.tokenService.segundosDeVida(),
    );
  }

  /** Vuelve a habilitar a un usuario reactivado antes de que venza la marca. */
  async rehabilitarUsuario(usuarioId: number): Promise<void> {
    await this.redis.delete(RedisKeys.usuarioRevocado(usuarioId));
  }

  /** Lo consulta el JwtStrategy en cada request autenticado. */
  async estaRevocado(accessToken: string, usuarioId: number): Promise<boolean> {
    const [tokenRevocado, usuarioRevocado] = await Promise.all([
      this.redis.exists(RedisKeys.blacklist(accessToken)),
      this.redis.exists(RedisKeys.usuarioRevocado(usuarioId)),
    ]);

    return tokenRevocado || usuarioRevocado;
  }

  async borrarRefreshToken(refreshToken: string): Promise<void> {
    await this.redis.delete(RedisKeys.refreshToken(refreshToken));
  }
}
