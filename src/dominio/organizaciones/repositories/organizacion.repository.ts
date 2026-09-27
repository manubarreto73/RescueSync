import { Injectable } from '@nestjs/common';
import { Organizacion, Prisma, TipoOrganizacion } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { PrismaTransaction } from '../../../prisma/transaction.types';

@Injectable()
export class OrganizacionRepository {
  constructor(private readonly prisma: PrismaService) {}

  private db(tx?: PrismaTransaction) {
    return tx ?? this.prisma;
  }

  findById(id: number, tx?: PrismaTransaction): Promise<Organizacion | null> {
    return this.db(tx).organizacion.findFirst({ where: { id, activo: true } });
  }

  existsByNombre(nombre: string, excluyendoId?: number, tx?: PrismaTransaction): Promise<boolean> {
    return this.contar({ nombre }, excluyendoId, tx);
  }

  existsByCuit(cuit: string, excluyendoId?: number, tx?: PrismaTransaction): Promise<boolean> {
    return this.contar({ cuit }, excluyendoId, tx);
  }

  existsByCodigoNacional(
    codigoNacional: string,
    excluyendoId?: number,
    tx?: PrismaTransaction,
  ): Promise<boolean> {
    return this.contar({ codigoNacional }, excluyendoId, tx);
  }

  /**
   * Las tres verificaciones de unicidad son la misma consulta con distinto
   * campo. Se factoriza en vez de repetirla: si manana hay que excluir
   * tambien las inactivas, se cambia en un solo lugar.
   *
   * Ojo: no filtra por activo. Una organizacion dada de baja sigue ocupando
   * su nombre y su CUIT, porque la restriccion unica de Postgres no sabe de
   * bajas logicas. Reutilizarlos daria un 500 por violacion de constraint en
   * vez de un 400 explicado.
   */
  private contar(
    where: Prisma.OrganizacionWhereInput,
    excluyendoId?: number,
    tx?: PrismaTransaction,
  ): Promise<boolean> {
    return this.db(tx)
      .organizacion.count({
        where: { ...where, ...(excluyendoId ? { id: { not: excluyendoId } } : {}) },
      })
      .then((total) => total > 0);
  }

  async buscar(
    filtros: { busqueda?: string; tipo?: TipoOrganizacion },
    skip: number,
    take: number,
    tx?: PrismaTransaction,
  ): Promise<[Organizacion[], number]> {
    const where: Prisma.OrganizacionWhereInput = {
      activo: true,
      ...(filtros.tipo ? { tipo: filtros.tipo } : {}),
      ...(filtros.busqueda
        ? {
            OR: [
              { nombre: { contains: filtros.busqueda, mode: 'insensitive' } },
              { localidad: { contains: filtros.busqueda, mode: 'insensitive' } },
              { cuit: { contains: filtros.busqueda } },
            ],
          }
        : {}),
    };

    const db = this.db(tx);

    return Promise.all([
      db.organizacion.findMany({ where, skip, take, orderBy: { nombre: 'asc' } }),
      db.organizacion.count({ where }),
    ]);
  }

  create(data: Prisma.OrganizacionCreateInput, tx?: PrismaTransaction): Promise<Organizacion> {
    return this.db(tx).organizacion.create({ data });
  }

  update(
    id: number,
    data: Prisma.OrganizacionUpdateInput,
    tx?: PrismaTransaction,
  ): Promise<Organizacion> {
    return this.db(tx).organizacion.update({ where: { id }, data });
  }

  desactivar(id: number, tx?: PrismaTransaction): Promise<Organizacion> {
    return this.db(tx).organizacion.update({ where: { id }, data: { activo: false } });
  }

  /** Cuantos usuarios activos cuelgan de esta organizacion. */
  contarUsuariosActivos(id: number, tx?: PrismaTransaction): Promise<number> {
    return this.db(tx).usuario.count({ where: { organizacionId: id, activo: true } });
  }
}
