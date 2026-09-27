import path from 'node:path';
import 'dotenv/config';
import type { PrismaConfig } from 'prisma';

/**
 * Configuracion del CLI de Prisma (reemplaza al bloque "prisma" del package.json,
 * deprecado desde Prisma 6).
 *
 * Solo la usa el CLI: migraciones, generate, studio y seed. La app en runtime
 * no lee este archivo.
 */
export default {
  // Carpeta, no archivo: Prisma concatena todos los .prisma que encuentre.
  schema: path.join('prisma', 'schema'),

  migrations: {
    path: path.join('prisma', 'migrations'),
    seed: 'ts-node prisma/seed.ts',
  },
} satisfies PrismaConfig;
