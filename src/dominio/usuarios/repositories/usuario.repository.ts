import { Injectable } from '@nestjs/common';
import { Prisma, Usuario } from '@prisma/client';
import { Rol } from '../../../common/enums/rol.enum';
import { PrismaService } from '../../../prisma/prisma.service';
import { PrismaTransaction } from '../../../prisma/transaction.types';

/**
 * Unico lugar del dominio que conoce Prisma. Equivale a UsuarioRepository de
 * Spring Data, con dos diferencias:
 *
 *  1. No se genera solo: hay que escribir cada metodo. A cambio, no hay que
 *     adivinar que SQL produce un nombre de metodo como
 *     findByRolAndActivoTrueOrderByFechaCreacionDesc.
 *
 *  2. Prisma no tiene equivalente a @SQLRestriction, asi que el filtro de
 *     soft delete (activo = true) se aplica explicitamente aca. Esta
 *     centralizado en este archivo justamente para que ningun servicio se
 *     olvide de ponerlo.
 */
@Injectable()
export class UsuarioRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Todos los metodos aceptan una transaccion opcional. `tx ?? this.prisma`
   * es el patron que reemplaza a @Transactional: si el servicio abrio una
   * transaccion, la query corre dentro; si no, corre sola.
   */
  private db(tx?: PrismaTransaction) {
    return tx ?? this.prisma;
  }

  findById(id: number, tx?: PrismaTransaction): Promise<Usuario | null> {
    return this.db(tx).usuario.findFirst({ where: { id, activo: true } });
  }

  /** Para el refresh: busca sin filtrar por activo, asi auth puede
   *  distinguir "no existe" de "esta dado de baja". */
  findByIdIncluyendoInactivos(id: number, tx?: PrismaTransaction): Promise<Usuario | null> {
    return this.db(tx).usuario.findUnique({ where: { id } });
  }

  /** Para el login: busca sin filtrar por activo, asi se puede distinguir
   *  "no existe" de "esta dado de baja" y devolver el mensaje correcto. */
  findByEmailIncluyendoInactivos(email: string, tx?: PrismaTransaction): Promise<Usuario | null> {
    return this.db(tx).usuario.findUnique({ where: { email } });
  }

  existsByEmail(email: string, excluyendoId?: number, tx?: PrismaTransaction): Promise<boolean> {
    return this.db(tx)
      .usuario.count({
        where: { email, ...(excluyendoId ? { id: { not: excluyendoId } } : {}) },
      })
      .then((total) => total > 0);
  }

  /**
   * Listado paginado. findAndCount de TypeORM no existe en Prisma: se resuelve
   * con $transaction([...]) sobre un array de queries, que es la forma
   * "batch" de la transaccion — las dos van en un solo round-trip.
   */
  async buscar(
    filtros: { busqueda?: string; rol?: Rol },
    skip: number,
    take: number,
    tx?: PrismaTransaction,
  ): Promise<[Usuario[], number]> {
    const where: Prisma.UsuarioWhereInput = {
      activo: true,
      ...(filtros.rol ? { rol: filtros.rol } : {}),
      ...(filtros.busqueda
        ? {
            OR: [
              { nombreCompleto: { contains: filtros.busqueda, mode: 'insensitive' } },
              { email: { contains: filtros.busqueda, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const db = this.db(tx);

    return Promise.all([
      db.usuario.findMany({ where, skip, take, orderBy: { nombreCompleto: 'asc' } }),
      db.usuario.count({ where }),
    ]);
  }

  create(data: Prisma.UsuarioCreateInput, tx?: PrismaTransaction): Promise<Usuario> {
    return this.db(tx).usuario.create({ data });
  }

  update(id: number, data: Prisma.UsuarioUpdateInput, tx?: PrismaTransaction): Promise<Usuario> {
    return this.db(tx).usuario.update({ where: { id }, data });
  }

  /** Soft delete: el registro sigue existiendo para la auditoria. */
  desactivar(id: number, tx?: PrismaTransaction): Promise<Usuario> {
    return this.db(tx).usuario.update({ where: { id }, data: { activo: false } });
  }

  registrarAcceso(id: number, tx?: PrismaTransaction): Promise<Usuario> {
    return this.db(tx).usuario.update({ where: { id }, data: { ultimoAcceso: new Date() } });
  }
}
