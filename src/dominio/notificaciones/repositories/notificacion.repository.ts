import { Injectable } from '@nestjs/common';
import { Notificacion, Prisma, TipoOrganizacion } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class NotificacionRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Organizaciones activas que reciben las convocatorias de la red. */
  async organizacionesDeLaRed(): Promise<number[]> {
    const organizaciones = await this.prisma.organizacion.findMany({
      where: {
        activo: true,
        tipo: { in: [TipoOrganizacion.ONG, TipoOrganizacion.ORGANISMO_RESCATE] },
      },
      select: { id: true },
    });

    return organizaciones.map((o) => o.id);
  }

  async crearVarias(data: Prisma.NotificacionCreateManyInput[]): Promise<void> {
    await this.prisma.notificacion.createMany({ data });
  }

  listarDeOrganizacion(organizacionId: number, limite: number): Promise<Notificacion[]> {
    return this.prisma.notificacion.findMany({
      where: { organizacionId },
      orderBy: { id: 'desc' },
      take: limite,
    });
  }

  /** Devuelve null si no existe o es de otra organizacion. */
  async marcarLeida(id: number, organizacionId: number): Promise<Notificacion | null> {
    const notificacion = await this.prisma.notificacion.findFirst({
      where: { id, organizacionId },
    });
    if (!notificacion) return null;

    return this.prisma.notificacion.update({ where: { id }, data: { leida: true } });
  }
}
