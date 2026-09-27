import { Module } from '@nestjs/common';
import { UsuariosModule } from '../usuarios/usuarios.module';
import { AuthController } from './controller/auth.controller';
import { AuthService } from './services/auth.service';
import { LoginAttemptsService } from './services/login-attempts.service';

/**
 * Importa UsuariosModule para usar UsuariosService (que ese modulo exporta).
 * TokenService, PasswordService y RedisService llegan por los modulos
 * globales SecurityModule y RedisModule.
 */
@Module({
  imports: [UsuariosModule],
  controllers: [AuthController],
  providers: [AuthService, LoginAttemptsService],
})
export class AuthModule {}
