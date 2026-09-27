import { Rol, TipoOrganizacion } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../src/prisma/prisma.service';
import { RedisService } from '../../src/redis/redis.service';
import { TestContext } from './test-app';

/** Contrasena de todos los usuarios de test. */
export const PASSWORD_TEST = 'Rescue2026!';

export const ORGANIZACIONES_BASE = [
  { nombre: 'Municipalidad de Villa Test', tipo: TipoOrganizacion.MUNICIPIO, cuit: '30111111111' },
  { nombre: 'Cruz Solidaria', tipo: TipoOrganizacion.ONG, cuit: '30222222222' },
  {
    nombre: 'Bomberos Voluntarios de Test',
    tipo: TipoOrganizacion.ORGANISMO_RESCATE,
    cuit: '30333333333',
  },
] as const;

export const ORG_MUNICIPIO = 1;
export const ORG_ONG = 2;
export const ORG_RESCATE = 3;

/**
 * Usuarios base de cada test. Son siempre los mismos, en el mismo orden, y
 * como las tablas se truncan con RESTART IDENTITY antes de cada test, los ids
 * son deterministas: 1, 2, 3 y 4.
 *
 * Esto importa: un test que dependa de "el id que salga" es un test que falla
 * distinto cada vez que lo corres.
 *
 * Respetan la regla de pertenencia: el operador municipal cuelga de un
 * MUNICIPIO y el representante de una ONG; el coordinador y el auditor son
 * transversales a la red y no pertenecen a ninguna organizacion.
 */
export const USUARIOS_BASE = [
  {
    email: 'municipio@test.ar',
    nombreCompleto: 'Laura Fernandez',
    rol: Rol.OPERADOR_MUNICIPAL,
    organizacionId: ORG_MUNICIPIO as number | null,
  },
  {
    email: 'coordinador@test.ar',
    nombreCompleto: 'Martin Sosa',
    rol: Rol.CENTRO_COORDINADOR,
    organizacionId: null,
  },
  {
    email: 'ong@test.ar',
    nombreCompleto: 'Ana Diaz',
    rol: Rol.REPRESENTANTE_ONG,
    organizacionId: ORG_ONG as number | null,
  },
  {
    email: 'auditor@test.ar',
    nombreCompleto: 'Jorge Medina',
    rol: Rol.AUDITOR,
    organizacionId: null,
  },
];

export const ID_MUNICIPIO = 1;
export const ID_COORDINADOR = 2;
export const ID_ONG = 3;
export const ID_AUDITOR = 4;

/**
 * Deja la base y Redis en un estado conocido.
 *
 * Se llama en beforeEach y no en beforeAll a proposito: cada test arranca de
 * cero, asi el resultado no depende del orden en que Jest los ejecute ni de
 * lo que haya hecho el test anterior.
 *
 * Las tablas van en un solo TRUNCATE: CASCADE resuelve las foreign keys entre
 * ellas, y RESTART IDENTITY reinicia las secuencias de los ids.
 */
export async function limpiarBase(prisma: PrismaService): Promise<void> {
  // Se nombran todas explicitamente aunque CASCADE alcanzaria: si manana
  // alguna deja de tener foreign key hacia las otras, el CASCADE dejaria de
  // limpiarla en silencio y los tests empezarian a contaminarse entre si.
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "oferta_versiones", "oferta_lineas", "oferta_participantes", "ofertas", ' +
      '"lotes", "emergencias", "usuarios", "organizaciones" RESTART IDENTITY CASCADE',
  );
}

/** Vacia la base de Redis de tests (la 1, nunca la de desarrollo). */
export async function limpiarRedis(redis: RedisService): Promise<void> {
  await redis.flushDb();
}

/** Inserta las 3 organizaciones y los 4 usuarios base. */
export async function sembrarDatos(prisma: PrismaService): Promise<void> {
  await prisma.organizacion.createMany({ data: [...ORGANIZACIONES_BASE] });

  const password = await bcrypt.hash(PASSWORD_TEST, 4);

  await prisma.usuario.createMany({
    data: USUARIOS_BASE.map((u) => ({ ...u, password })),
  });
}

/** El combo completo que usa casi todo beforeEach. */
export async function resetearEstado(ctx: TestContext): Promise<void> {
  await limpiarBase(ctx.prisma);
  await limpiarRedis(ctx.redis);
  await sembrarDatos(ctx.prisma);
}
