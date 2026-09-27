import { Module } from '@nestjs/common';
import { OrganizacionesController } from './controller/organizaciones.controller';
import { OrganizacionRepository } from './repositories/organizacion.repository';
import { OrganizacionesService } from './services/organizaciones.service';

/**
 * Exporta el servicio porque UsuariosModule lo necesita: al dar de alta un
 * usuario hay que validar que la organizacion exista y que su tipo sea
 * coherente con el rol.
 */
@Module({
  controllers: [OrganizacionesController],
  providers: [OrganizacionesService, OrganizacionRepository],
  exports: [OrganizacionesService],
})
export class OrganizacionesModule {}
