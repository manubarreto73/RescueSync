import { Injectable } from '@nestjs/common';
import { EstadoEmergencia, NivelGravedad, Prisma, TipoDesastre } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { PrismaTransaction } from '../../../prisma/transaction.types';
import { EmergenciaConRelaciones } from '../dtos/emergencia-response.dto';

/**
 * Las relaciones que necesita el Response, declaradas una sola vez.
 *
 * `select` en vez de `true`: de la organizacion y del usuario solo salen el
 * id y el nombre. Traer el registro entero significaria arrastrar el hash de
 * la contrasena del usuario hasta la capa de servicio en cada listado, y el
 * dia que alguien devuelva el modelo crudo por error, filtrarlo.
 */
const RELACIONES = {
  municipio: { select: { id: true, nombre: true } },
  registradaPor: { select: { id: true, nombreCompleto: true } },
} satisfies Prisma.EmergenciaInclude;

export interface FiltrosEmergencia {
  busqueda?: string;
  estado?: EstadoEmergencia;
  gravedad?: NivelGravedad;
  tipo?: TipoDesastre;
}

@Injectable()
export class EmergenciaRepository {
  constructor(private readonly prisma: PrismaService) {}

  private db(tx?: PrismaTransaction) {
    return tx ?? this.prisma;
  }

  findById(id: number, tx?: PrismaTransaction): Promise<EmergenciaConRelaciones | null> {
    return this.db(tx).emergencia.findUnique({ where: { id }, include: RELACIONES });
  }

  /**
   * El listado recibe un `alcance` ya armado por el servicio: es la clausula
   * que limita que filas puede ver este usuario. Se combina con los filtros
   * del cliente con un AND, de modo que ningun filtro pueda ampliarlo.
   */
  async buscar(
    alcance: Prisma.EmergenciaWhereInput,
    filtros: FiltrosEmergencia,
    skip: number,
    take: number,
    tx?: PrismaTransaction,
  ): Promise<[EmergenciaConRelaciones[], number]> {
    const where: Prisma.EmergenciaWhereInput = {
      AND: [
        alcance,
        {
          ...(filtros.estado ? { estado: filtros.estado } : {}),
          ...(filtros.gravedad ? { gravedad: filtros.gravedad } : {}),
          ...(filtros.tipo ? { tipo: filtros.tipo } : {}),
          ...(filtros.busqueda
            ? {
                OR: [
                  { zonaAfectada: { contains: filtros.busqueda, mode: 'insensitive' } },
                  { descripcion: { contains: filtros.busqueda, mode: 'insensitive' } },
                ],
              }
            : {}),
        },
      ],
    };

    const db = this.db(tx);

    return Promise.all([
      db.emergencia.findMany({
        where,
        skip,
        take,
        include: RELACIONES,
        // Las criticas primero y, dentro de cada nivel, las mas recientes:
        // es el orden en que las mira un coordinador.
        orderBy: [{ gravedad: 'desc' }, { fechaCreacion: 'desc' }],
      }),
      db.emergencia.count({ where }),
    ]);
  }

  create(
    data: Prisma.EmergenciaCreateInput,
    tx?: PrismaTransaction,
  ): Promise<EmergenciaConRelaciones> {
    return this.db(tx).emergencia.create({ data, include: RELACIONES });
  }

  update(
    id: number,
    data: Prisma.EmergenciaUpdateInput,
    tx?: PrismaTransaction,
  ): Promise<EmergenciaConRelaciones> {
    return this.db(tx).emergencia.update({ where: { id }, data, include: RELACIONES });
  }
}
