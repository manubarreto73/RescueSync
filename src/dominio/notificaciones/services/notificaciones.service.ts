import { ForbiddenException, Injectable } from '@nestjs/common';
import { TipoNotificacion } from '@prisma/client';
import { ResourceNotFoundException } from '../../../common/exceptions/resource-not-found.exception';
import { AuthenticatedUser } from '../../../security/interfaces/jwt-payload.interface';
import { NotificacionResponseDto } from '../dtos/notificacion-response.dto';
import { NotificacionRepository } from '../repositories/notificacion.repository';

const LIMITE_LISTADO = 100;

@Injectable()
export class NotificacionesService {
  constructor(private readonly notificacionRepository: NotificacionRepository) {}

  /** Eslabon 3: las ONGs de la red reciben la notificacion de la convocatoria. */
  async notificarConvocatoria(emergencia: { id: number; zonaAfectada: string }): Promise<void> {
    const organizaciones = await this.notificacionRepository.organizacionesDeLaRed();

    await this.notificacionRepository.crearVarias(
      organizaciones.map((organizacionId) => ({
        organizacionId,
        emergenciaId: emergencia.id,
        tipo: TipoNotificacion.CONVOCATORIA_ABIERTA,
        mensaje: `Se abrió una convocatoria para la emergencia en ${emergencia.zonaAfectada}.`,
      })),
    );
  }

  /** Eslabon 5: cada integrante de la oferta se entera de la decision del municipio. */
  async notificarResultadoOferta(
    oferta: { id: number; emergenciaId: number; participantes: { organizacionId: number }[] },
    adjudicada: boolean,
  ): Promise<void> {
    await this.notificacionRepository.crearVarias(
      oferta.participantes.map(({ organizacionId }) => ({
        organizacionId,
        emergenciaId: oferta.emergenciaId,
        tipo: adjudicada
          ? TipoNotificacion.OFERTA_ADJUDICADA
          : TipoNotificacion.OFERTA_NO_ADJUDICADA,
        mensaje: adjudicada
          ? `Tu oferta #${oferta.id} fue seleccionada: tu organización es responsable dentro del proyecto.`
          : `Tu oferta #${oferta.id} no fue seleccionada.`,
      })),
    );
  }

  async listar(user: AuthenticatedUser): Promise<NotificacionResponseDto[]> {
    const notificaciones = await this.notificacionRepository.listarDeOrganizacion(
      this.organizacionDe(user),
      LIMITE_LISTADO,
    );

    return notificaciones.map(NotificacionResponseDto.from);
  }

  async marcarLeida(id: number, user: AuthenticatedUser): Promise<NotificacionResponseDto> {
    const notificacion = await this.notificacionRepository.marcarLeida(
      id,
      this.organizacionDe(user),
    );

    if (!notificacion) {
      throw new ResourceNotFoundException(`Notificacion no encontrada con id: ${id}`);
    }

    return NotificacionResponseDto.from(notificacion);
  }

  private organizacionDe(user: AuthenticatedUser): number {
    if (!user.organizacionId) {
      throw new ForbiddenException('Su usuario no pertenece a ninguna organizacion');
    }
    return user.organizacionId;
  }
}
