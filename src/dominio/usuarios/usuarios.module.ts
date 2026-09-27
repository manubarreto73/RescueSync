import { Module } from '@nestjs/common';
import { OrganizacionesModule } from '../organizaciones/organizaciones.module';
import { UsuariosController } from './controller/usuarios.controller';
import { UsuarioRepository } from './repositories/usuario.repository';
import { UsuariosService } from './services/usuarios.service';

/**
 * PrismaService y PasswordService no se importan: vienen de PrismaModule y
 * SecurityModule, que estan marcados @Global.
 *
 * UsuariosService se exporta porque AuthModule lo necesita para el login.
 */
@Module({
  imports: [OrganizacionesModule],
  controllers: [UsuariosController],
  providers: [UsuariosService, UsuarioRepository],
  exports: [UsuariosService],
})
export class UsuariosModule {}
