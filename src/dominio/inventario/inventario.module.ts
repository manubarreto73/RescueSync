import { Module } from '@nestjs/common';
import { SistemaNacionalClient } from '../../integracion/sistema-nacional/sistema-nacional.client';
import { OrganizacionesModule } from '../organizaciones/organizaciones.module';
import { InventarioController } from './inventario.controller';

@Module({
  imports: [OrganizacionesModule],
  controllers: [InventarioController],
  providers: [SistemaNacionalClient],
})
export class InventarioModule {}
