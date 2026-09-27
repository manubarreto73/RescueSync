import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { SignOptions } from 'jsonwebtoken';
import { PassportModule } from '@nestjs/passport';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { PasswordService } from './password.service';
import { SessionRevocationService } from './session-revocation.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { TokenService } from './token.service';

/**
 * Equivalente a SecurityConfig de Spring Security.
 *
 * Aca se arma la cadena de seguridad: la estrategia que valida el token, los
 * dos guards globales (autenticacion primero, roles despues) y los servicios
 * de hashing y emision de tokens que usara el modulo de auth.
 */
@Global()
@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('jwt.secret'),
        signOptions: {
          // jsonwebtoken tipa expiresIn como un literal ('15m', '7d'...), no como
          // string generico; el valor viene del .env asi que se afirma el tipo.
          expiresIn: config.get<string>('jwt.expiration', '15m') as SignOptions['expiresIn'],
        },
      }),
    }),
  ],
  providers: [
    JwtStrategy,
    TokenService,
    PasswordService,
    SessionRevocationService,
    // El orden importa: Nest ejecuta los guards globales en el orden de registro.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [TokenService, PasswordService, SessionRevocationService, JwtModule],
})
export class SecurityModule {}
