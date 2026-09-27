import { Injectable } from '@nestjs/common';
import { EstadoOferta, Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { PrismaTransaction } from '../../../prisma/transaction.types';
import { OfertaConRelaciones } from '../dtos/oferta-response.dto';

const RELACIONES = {
  organizacionLider: { select: { id: true, nombre: true } },
  participantes: {
    include: { organizacion: { select: { id: true, nombre: true, codigoNacional: true } } },
    orderBy: { esLider: 'desc' },
  },
  lineas: {
    include: {
      lote: { select: { id: true, descripcion: true, unidad: true, cantidadRequerida: true } },
      organizacion: { select: { id: true, nombre: true } },
    },
    orderBy: { loteId: 'asc' },
  },
} satisfies Prisma.OfertaInclude;

@Injectable()
export class OfertaRepository {
  constructor(private readonly prisma: PrismaService) {}

  private db(tx?: PrismaTransaction) {
    return tx ?? this.prisma;
  }

  findById(id: number, tx?: PrismaTransaction): Promise<OfertaConRelaciones | null> {
    return this.db(tx).oferta.findUnique({ where: { id }, include: RELACIONES });
  }

  async buscar(
    alcance: Prisma.OfertaWhereInput,
    filtros: { emergenciaId?: number; estado?: EstadoOferta },
    skip: number,
    take: number,
    tx?: PrismaTransaction,
  ): Promise<[OfertaConRelaciones[], number]> {
    const where: Prisma.OfertaWhereInput = {
      AND: [
        alcance,
        {
          ...(filtros.emergenciaId ? { emergenciaId: filtros.emergenciaId } : {}),
          ...(filtros.estado ? { estado: filtros.estado } : {}),
        },
      ],
    };

    const db = this.db(tx);

    return Promise.all([
      db.oferta.findMany({ where, skip, take, include: RELACIONES, orderBy: { id: 'desc' } }),
      db.oferta.count({ where }),
    ]);
  }

  /** Todas las ofertas de una emergencia, sin paginar. Lo usa el consolidado que consulta Bonita. */
  findPorEmergencia(
    emergenciaId: number,
    estados: EstadoOferta[],
    tx?: PrismaTransaction,
  ): Promise<OfertaConRelaciones[]> {
    return this.db(tx).oferta.findMany({
      where: { emergenciaId, estado: { in: estados } },
      include: RELACIONES,
      orderBy: { id: 'asc' },
    });
  }

  create(data: Prisma.OfertaCreateInput, tx?: PrismaTransaction): Promise<OfertaConRelaciones> {
    return this.db(tx).oferta.create({ data, include: RELACIONES });
  }

  update(
    id: number,
    data: Prisma.OfertaUpdateInput,
    tx?: PrismaTransaction,
  ): Promise<OfertaConRelaciones> {
    return this.db(tx).oferta.update({ where: { id }, data, include: RELACIONES });
  }

  async reemplazarLineas(
    ofertaId: number,
    lineas: { loteId: number; organizacionId: number; cantidad: number }[],
    tx: PrismaTransaction,
  ): Promise<void> {
    await tx.ofertaLinea.deleteMany({ where: { ofertaId } });
    await tx.ofertaLinea.createMany({ data: lineas.map((l) => ({ ...l, ofertaId })) });
  }

  async reemplazarParticipantes(
    ofertaId: number,
    participantes: { organizacionId: number; esLider: boolean }[],
    tx: PrismaTransaction,
  ): Promise<void> {
    await tx.ofertaParticipante.deleteMany({ where: { ofertaId } });
    await tx.ofertaParticipante.createMany({
      data: participantes.map((p) => ({ ...p, ofertaId })),
    });
  }

  guardarVersion(
    ofertaId: number,
    version: number,
    snapshot: Prisma.InputJsonValue,
    modificadaPorId: number,
    tx?: PrismaTransaction,
  ) {
    return this.db(tx).ofertaVersion.create({
      data: { ofertaId, version, snapshot, modificadaPorId },
    });
  }

  listarVersiones(ofertaId: number, tx?: PrismaTransaction) {
    return this.db(tx).ofertaVersion.findMany({
      where: { ofertaId },
      include: { modificadaPor: { select: { id: true, nombreCompleto: true } } },
      orderBy: { version: 'desc' },
    });
  }

  marcarParticipanteFinalizado(ofertaId: number, organizacionId: number, tx?: PrismaTransaction) {
    return this.db(tx).ofertaParticipante.update({
      where: { ofertaId_organizacionId: { ofertaId, organizacionId } },
      data: { finalizado: true, fechaFinalizacion: new Date() },
    });
  }

  actualizarLinea(id: number, data: Prisma.OfertaLineaUpdateInput, tx?: PrismaTransaction) {
    return this.db(tx).ofertaLinea.update({ where: { id }, data });
  }
}
