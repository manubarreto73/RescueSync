import { Injectable } from '@nestjs/common';
import { EstadoOferta, Lote, Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { PrismaTransaction } from '../../../prisma/transaction.types';

@Injectable()
export class LoteRepository {
  constructor(private readonly prisma: PrismaService) {}

  private db(tx?: PrismaTransaction) {
    return tx ?? this.prisma;
  }

  findById(id: number, tx?: PrismaTransaction): Promise<Lote | null> {
    return this.db(tx).lote.findUnique({ where: { id } });
  }

  findByEmergencia(emergenciaId: number, tx?: PrismaTransaction): Promise<Lote[]> {
    return this.db(tx).lote.findMany({
      where: { emergenciaId },
      orderBy: [{ categoria: 'asc' }, { id: 'asc' }],
    });
  }

  contarPorEmergencia(emergenciaId: number, tx?: PrismaTransaction): Promise<number> {
    return this.db(tx).lote.count({ where: { emergenciaId } });
  }

  existsDescripcionEnEmergencia(
    emergenciaId: number,
    descripcion: string,
    excluyendoId?: number,
    tx?: PrismaTransaction,
  ): Promise<boolean> {
    return this.db(tx)
      .lote.count({
        where: {
          emergenciaId,
          descripcion: { equals: descripcion, mode: 'insensitive' },
          ...(excluyendoId ? { id: { not: excluyendoId } } : {}),
        },
      })
      .then((total) => total > 0);
  }

  create(data: Prisma.LoteCreateInput, tx?: PrismaTransaction): Promise<Lote> {
    return this.db(tx).lote.create({ data });
  }

  update(id: number, data: Prisma.LoteUpdateInput, tx?: PrismaTransaction): Promise<Lote> {
    return this.db(tx).lote.update({ where: { id }, data });
  }

  delete(id: number, tx?: PrismaTransaction): Promise<Lote> {
    return this.db(tx).lote.delete({ where: { id } });
  }

  /**
   * Cuanto tiene cubierto cada lote de una emergencia, contando solo las
   * ofertas adjudicadas o ya finalizadas.
   *
   * La consulta vive en el repositorio de lotes y no en OfertasService a
   * proposito: pedirsela al otro servicio crearia un ciclo lotes <-> ofertas
   * que habria que parchear con forwardRef, y esto no es una regla de
   * negocio de ofertas, es una lectura. El repositorio es justamente la capa
   * que puede consultar las tablas que necesite.
   *
   * groupBy con _sum es el GROUP BY ... SUM() de SQL: mucho mas barato que
   * traer todas las lineas y sumarlas en memoria.
   */
  async coberturaPorLote(
    emergenciaId: number,
    tx?: PrismaTransaction,
  ): Promise<Map<number, number>> {
    const filas = await this.db(tx).ofertaLinea.groupBy({
      by: ['loteId'],
      where: {
        lote: { emergenciaId },
        oferta: { estado: { in: [EstadoOferta.ADJUDICADA, EstadoOferta.FINALIZADA] } },
      },
      _sum: { cantidad: true },
    });

    return new Map(filas.map((f) => [f.loteId, f._sum.cantidad ?? 0]));
  }

  /** Si alguna oferta referencia este lote, ya no se puede borrar. */
  async tieneOfertas(loteId: number, tx?: PrismaTransaction): Promise<boolean> {
    return (await this.db(tx).ofertaLinea.count({ where: { loteId } })) > 0;
  }
}
