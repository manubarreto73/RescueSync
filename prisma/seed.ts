import {
  CategoriaRecurso,
  NivelGravedad,
  PrismaClient,
  Rol,
  TipoDesastre,
  TipoOrganizacion,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';

/**
 * Datos iniciales de desarrollo. Equivalente a un data.sql de Spring.
 *
 * Se ejecuta con `npm run db:seed`, y automaticamente despues de
 * `prisma migrate reset`.
 *
 * Es idempotente (upsert, no create): se puede correr las veces que haga
 * falta sin romper por clave duplicada.
 */
const prisma = new PrismaClient();

const PASSWORD_DEMO = 'Rescue2026!';

const organizaciones = [
  {
    nombre: 'Municipalidad de Villa Carlos Paz',
    tipo: TipoOrganizacion.MUNICIPIO,
    cuit: '30700000001',
    localidad: 'Villa Carlos Paz',
    provincia: 'Cordoba',
    emailContacto: 'defensacivil@carlospaz.gob.ar',
  },
  {
    nombre: 'Cruz Solidaria',
    tipo: TipoOrganizacion.ONG,
    cuit: '30700000002',
    codigoNacional: 'ONG-0001',
    localidad: 'Cordoba',
    provincia: 'Cordoba',
    emailContacto: 'contacto@cruzsolidaria.org',
  },
  {
    nombre: 'Bomberos Voluntarios de Cosquin',
    tipo: TipoOrganizacion.ORGANISMO_RESCATE,
    cuit: '30700000003',
    codigoNacional: 'ORG-0002',
    localidad: 'Cosquin',
    provincia: 'Cordoba',
  },
  {
    nombre: 'Centro Coordinador Regional Centro',
    tipo: TipoOrganizacion.CENTRO_COORDINADOR,
    cuit: '30700000004',
    localidad: 'Cordoba',
    provincia: 'Cordoba',
  },
];

/** La organizacion de cada usuario se resuelve por nombre despues del alta. */
const usuarios = [
  {
    email: 'municipio@rescuesync.ar',
    nombreCompleto: 'Laura Fernandez',
    rol: Rol.OPERADOR_MUNICIPAL,
    telefono: '+54 9 351 555-0001',
    organizacion: 'Municipalidad de Villa Carlos Paz',
  },
  {
    email: 'coordinador@rescuesync.ar',
    nombreCompleto: 'Martin Sosa',
    rol: Rol.CENTRO_COORDINADOR,
    telefono: '+54 9 351 555-0002',
    organizacion: null,
  },
  {
    email: 'ong@rescuesync.ar',
    nombreCompleto: 'Ana Diaz',
    rol: Rol.REPRESENTANTE_ONG,
    telefono: '+54 9 351 555-0003',
    organizacion: 'Cruz Solidaria',
  },
  {
    email: 'bomberos@rescuesync.ar',
    nombreCompleto: 'Carlos Peralta',
    rol: Rol.REPRESENTANTE_ONG,
    telefono: '+54 9 351 555-0005',
    organizacion: 'Bomberos Voluntarios de Cosquin',
  },
  {
    email: 'auditor@rescuesync.ar',
    nombreCompleto: 'Jorge Medina',
    rol: Rol.AUDITOR,
    telefono: '+54 9 351 555-0004',
    organizacion: null,
  },
  // Superusuario de desarrollo: todos los permisos, sin organizacion. No se
  // siembra en produccion (y JwtStrategy lo rechaza ahi de todos modos).
  ...(process.env.NODE_ENV === 'production'
    ? []
    : [
        {
          email: 'admin@rescuesync.ar',
          nombreCompleto: 'Administrador (desarrollo)',
          rol: Rol.ADMIN,
          telefono: null,
          organizacion: null,
        },
      ]),
];

async function main() {
  const idPorNombre = new Map<string, number>();

  for (const organizacion of organizaciones) {
    const guardada = await prisma.organizacion.upsert({
      where: { nombre: organizacion.nombre },
      update: { ...organizacion, activo: true },
      create: organizacion,
    });

    idPorNombre.set(guardada.nombre, guardada.id);
    console.log(`  ${guardada.tipo.padEnd(20)} ${guardada.nombre}`);
  }

  console.log('');

  const password = await bcrypt.hash(PASSWORD_DEMO, 10);

  for (const { organizacion, ...usuario } of usuarios) {
    const organizacionId = organizacion ? (idPorNombre.get(organizacion) ?? null) : null;

    await prisma.usuario.upsert({
      where: { email: usuario.email },
      update: { ...usuario, organizacionId, activo: true },
      create: { ...usuario, organizacionId, password },
    });

    console.log(`  ${usuario.rol.padEnd(20)} ${usuario.email}`);
  }

  // Una emergencia de ejemplo, en estado REGISTRADA, para tener sobre que
  // probar las transiciones sin cargarla a mano cada vez.
  const municipio = await prisma.organizacion.findUniqueOrThrow({
    where: { nombre: 'Municipalidad de Villa Carlos Paz' },
  });
  const operador = await prisma.usuario.findUniqueOrThrow({
    where: { email: 'municipio@rescuesync.ar' },
  });

  const yaExiste = await prisma.emergencia.findFirst({ where: { municipioId: municipio.id } });

  if (!yaExiste) {
    const emergencia = await prisma.emergencia.create({
      data: {
        tipo: TipoDesastre.INUNDACION,
        gravedad: NivelGravedad.ALTA,
        zonaAfectada: 'Barrio Costanera y adyacencias, margen sur del rio San Antonio',
        descripcion:
          'Crecida del rio tras 48 horas de lluvias intensas. Viviendas anegadas en la ' +
          'ribera y corte del acceso norte. Se requiere evacuacion y asistencia sanitaria.',
        personasAfectadas: 350,
        fechaOcurrencia: new Date(Date.now() - 2 * 86400 * 1000),
        municipioId: municipio.id,
        registradaPorId: operador.id,
        // Dos lotes cargados, para poder publicar la convocatoria y ofertar
        // sin tener que armar el desglose a mano cada vez.
        lotes: {
          create: [
            {
              categoria: CategoriaRecurso.PERSONAL,
              descripcion: 'Paramedicos con experiencia en rescate acuatico',
              cantidadRequerida: 5,
              unidad: 'personas',
            },
            {
              categoria: CategoriaRecurso.ALIMENTOS,
              descripcion: 'Raciones de comida no perecedera',
              cantidadRequerida: 1000,
              unidad: 'raciones',
            },
          ],
        },
      },
      include: { lotes: { orderBy: { id: 'asc' } } },
    });

    console.log(`\n  EMERGENCIA #${emergencia.id}  ${emergencia.estado}  ${emergencia.tipo}`);
    emergencia.lotes.forEach((lote) => {
      console.log(
        `    LOTE #${lote.id}  ${lote.cantidadRequerida} ${lote.unidad} - ${lote.descripcion}`,
      );
    });
  }

  console.log(`\nSeed listo. Contrasena de todos los usuarios: ${PASSWORD_DEMO}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
