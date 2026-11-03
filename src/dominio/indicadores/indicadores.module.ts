import { Module } from '@nestjs/common';
import { BonitaModule } from '../../integracion/bonita/bonita.module';
import { IndicadoresController } from './indicadores.controller';
import { IndicadoresRepository } from './indicadores.repository';
import { IndicadoresService } from './indicadores.service';

@Module({
  imports: [BonitaModule],
  controllers: [IndicadoresController],
  providers: [IndicadoresService, IndicadoresRepository],
})
export class IndicadoresModule {}
