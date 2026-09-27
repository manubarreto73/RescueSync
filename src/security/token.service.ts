import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { JwtPayload } from './interfaces/jwt-payload.interface';

/**
 * Emision y verificacion de access tokens. Equivalente a JwtService de Stockeate.
 *
 * El refresh token con rotacion y blacklist vive en Redis y se implementa
 * junto con el modulo de auth (proxima etapa).
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  generateAccessToken(payload: JwtPayload): Promise<string> {
    return this.jwtService.signAsync(payload);
  }

  verifyAccessToken(token: string): Promise<JwtPayload> {
    return this.jwtService.verifyAsync<JwtPayload>(token);
  }

  /** Decodifica sin validar firma: util para leer el exp de un token ya vencido. */
  decode(token: string): JwtPayload | null {
    return this.jwtService.decode<JwtPayload | null>(token);
  }

  /**
   * Duracion del access token en segundos.
   *
   * Traduce el formato de jsonwebtoken ('15m', '2h', '7d') al numero que
   * necesitan el cliente (expiresIn de la respuesta de login) y los TTL de
   * las marcas de revocacion en Redis.
   */
  segundosDeVida(): number {
    const valor = this.config.get<string>('jwt.expiration', '15m');
    const match = /^(\d+)([smhd])?$/.exec(valor.trim());

    if (!match) return 900;

    const cantidad = Number(match[1]);
    const unidad = match[2] ?? 's';
    const factores: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };

    return cantidad * (factores[unidad] ?? 1);
  }
}
