import { Module } from '@nestjs/common';
import { NotificacionesController } from './controller/notificaciones.controller';
import { NotificacionRepository } from './repositories/notificacion.repository';
import { NotificacionesService } from './services/notificaciones.service';

/** Se exporta el servicio: emergencias y ofertas disparan las notificaciones. */
@Module({
  controllers: [NotificacionesController],
  providers: [NotificacionesService, NotificacionRepository],
  exports: [NotificacionesService],
})
export class NotificacionesModule {}
