import { Module, forwardRef } from '@nestjs/common';
import { LotesModule } from '../lotes/lotes.module';
import { EmergenciasController } from './controller/emergencias.controller';
import { EmergenciaRepository } from './repositories/emergencia.repository';
import { EmergenciasService } from './services/emergencias.service';

/**
 * Se exporta el servicio porque lotes y ofertas lo van a necesitar: para
 * saber si la ventana de convocatoria esta abierta hay que consultar el
 * estado de la emergencia.
 */
@Module({
  imports: [forwardRef(() => LotesModule)],
  controllers: [EmergenciasController],
  providers: [EmergenciasService, EmergenciaRepository],
  exports: [EmergenciasService],
})
export class EmergenciasModule {}
