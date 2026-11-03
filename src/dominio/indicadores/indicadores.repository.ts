import { Injectable } from '@nestjs/common';
import { EstadoOferta } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

const ADJUDICADAS: EstadoOferta[] = [EstadoOferta.ADJUDICADA, EstadoOferta.FINALIZADA];

@Injectable()
export class IndicadoresRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Lineas de las ofertas adjudicadas en el periodo [desde, hasta). */
  lineasAdjudicadas(desde: Date, hasta: Date) {
    return this.prisma.ofertaLinea.findMany({
      where: {
        oferta: { estado: { in: ADJUDICADAS }, fechaAdjudicacion: { gte: desde, lt: hasta } },
      },
      select: { cantidad: true, lote: { select: { categoria: true, unidad: true } } },
    });
  }

  ofertasAdjudicadas() {
    return this.prisma.oferta.findMany({
      where: { estado: { in: ADJUDICADAS } },
      select: { _count: { select: { participantes: true } } },
    });
  }

  emergenciasPorEstado() {
    return this.prisma.emergencia.groupBy({ by: ['estado'], _count: { _all: true } });
  }
}
