import { Module } from '@nestjs/common';
import { EmergenciasModule } from '../emergencias/emergencias.module';
import { NotificacionesModule } from '../notificaciones/notificaciones.module';
import { OrganizacionesModule } from '../organizaciones/organizaciones.module';
import { OfertasDeEmergenciaController } from './controller/ofertas-de-emergencia.controller';
import { OfertasController } from './controller/ofertas.controller';
import { OfertaRepository } from './repositories/oferta.repository';
import { OfertasService } from './services/ofertas.service';

/**
 * Sin forwardRef: por aca no pasa ningun ciclo.
 *
 * Ofertas depende de emergencias (para el acceso y la ventana de
 * convocatoria) y de organizaciones (para validar quien puede ofertar), y
 * ninguna de las dos vuelve a depender de ofertas.
 */
@Module({
  imports: [EmergenciasModule, OrganizacionesModule, NotificacionesModule],
  controllers: [OfertasController, OfertasDeEmergenciaController],
  providers: [OfertasService, OfertaRepository],
  exports: [OfertasService],
})
export class OfertasModule {}
