import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';

/**
 * Wrapper sobre ioredis. Equivalente al RedisService de Stockeate
 * (que envolvia RedisTemplate).
 *
 * Los TTL se expresan en segundos, que es la unidad nativa de Redis.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly client: Redis) {}

  async set(key: string, value: string, ttlSegundos?: number): Promise<void> {
    if (ttlSegundos && ttlSegundos > 0) {
      await this.client.set(key, value, 'EX', ttlSegundos);
    } else {
      await this.client.set(key, value);
    }
  }

  get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async delete(key: string): Promise<void> {
    await this.client.del(key);
  }

  async exists(key: string): Promise<boolean> {
    return (await this.client.exists(key)) === 1;
  }

  /**
   * Incrementa un contador y le pone TTL solo la primera vez.
   * Base del rate limiting de login: la ventana arranca en el primer intento.
   */
  async increment(key: string, ttlSegundos: number): Promise<number> {
    const valor = await this.client.incr(key);
    if (valor === 1) await this.client.expire(key, ttlSegundos);
    return valor;
  }

  /** Lee y borra en una sola operacion atomica (tokens de un solo uso). */
  getAndDelete(key: string): Promise<string | null> {
    return this.client.getdel(key);
  }

  /** Segundos que le quedan a la clave (-2 si no existe, -1 si no tiene TTL). */
  ttl(key: string): Promise<number> {
    return this.client.ttl(key);
  }

  /** Guarda un objeto serializado como JSON. */
  async setObject<T>(key: string, value: T, ttlSegundos?: number): Promise<void> {
    await this.set(key, JSON.stringify(value), ttlSegundos);
  }

  async getObject<T>(key: string): Promise<T | null> {
    const raw = await this.get(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      this.logger.warn(`Valor no parseable en la clave ${key}, se descarta`);
      return null;
    }
  }

  /**
   * Lista las claves que matchean un patron.
   *
   * Usa SCAN y no KEYS: KEYS recorre todo el keyspace bloqueando el servidor
   * mientras lo hace, lo cual en produccion con muchas claves es un problema
   * serio. SCAN itera de a lotes sin bloquear.
   */
  async keys(patron: string): Promise<string[]> {
    const encontradas: string[] = [];
    let cursor = '0';

    do {
      const [siguiente, lote] = await this.client.scan(cursor, 'MATCH', patron, 'COUNT', 100);
      cursor = siguiente;
      encontradas.push(...lote);
    } while (cursor !== '0');

    return encontradas;
  }

  /**
   * Vacia por completo la base de Redis en uso.
   *
   * Existe solo para que los tests arranquen de cero, y por eso se niega a
   * correr sobre la base 0, que es la de desarrollo. Sin esa guarda, un
   * .env.test mal configurado te borraria las sesiones y los contadores
   * reales sin avisar.
   */
  async flushDb(): Promise<void> {
    const db = this.client.options.db ?? 0;

    if (db === 0) {
      throw new Error(
        'flushDb() esta bloqueado sobre la base 0 de Redis (la de desarrollo). ' +
          'Los tests deben usar REDIS_DB=1.',
      );
    }

    await this.client.flushdb();
    this.logger.debug(`Base ${db} de Redis vaciada`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }
}
