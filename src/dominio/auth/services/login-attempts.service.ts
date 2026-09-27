import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisKeys } from '../../../redis/redis.keys';
import { RedisService } from '../../../redis/redis.service';

/**
 * Bloqueo de IP por intentos fallidos de login.
 *
 * Ojo con no confundirlo con el ThrottlerGuard: son dos cosas distintas que
 * se complementan.
 *
 *   ThrottlerGuard  -> limite de TRANSPORTE. Cuenta requests, no le importa
 *                      si salieron bien o mal. Protege de la sobrecarga.
 *   Este servicio   -> politica de SEGURIDAD. Cuenta solo los logins
 *                      fallidos y bloquea la IP un rato. Protege de la
 *                      fuerza bruta contra contrasenas.
 *
 * Alguien que prueba 5 contrasenas por minuto pasa tranquilo el throttler
 * (esta muy por debajo del limite) pero cae en este contador.
 */
@Injectable()
export class LoginAttemptsService {
  private readonly logger = new Logger(LoginAttemptsService.name);

  private readonly maxIntentos: number;
  private readonly ventanaMinutos: number;
  private readonly bloqueoMinutos: number;

  constructor(
    private readonly redis: RedisService,
    config: ConfigService,
  ) {
    this.maxIntentos = config.get<number>('rateLimit.maxLoginAttempts', 5);
    this.ventanaMinutos = config.get<number>('rateLimit.attemptsWindowMinutes', 5);
    this.bloqueoMinutos = config.get<number>('rateLimit.blockDurationMinutes', 30);
  }

  /** Minutos que le quedan de bloqueo a la IP, o 0 si no esta bloqueada. */
  async minutosDeBloqueo(ip: string): Promise<number> {
    const ttl = await this.redis.ttl(RedisKeys.blockedIp(ip));
    return ttl > 0 ? Math.ceil(ttl / 60) : 0;
  }

  /**
   * Suma un intento fallido y bloquea la IP si se paso del maximo.
   * Devuelve cuantos intentos le quedan antes del bloqueo.
   */
  async registrarFallo(ip: string): Promise<number> {
    const intentos = await this.redis.increment(
      RedisKeys.loginAttempts(ip),
      this.ventanaMinutos * 60,
    );

    if (intentos >= this.maxIntentos) {
      await this.redis.set(RedisKeys.blockedIp(ip), '1', this.bloqueoMinutos * 60);
      await this.redis.delete(RedisKeys.loginAttempts(ip));
      this.logger.warn(`IP ${ip} bloqueada por ${this.bloqueoMinutos} minutos`);
      return 0;
    }

    return this.maxIntentos - intentos;
  }

  /** Login exitoso: se limpia el contador. */
  async limpiar(ip: string): Promise<void> {
    await this.redis.delete(RedisKeys.loginAttempts(ip));
  }
}
