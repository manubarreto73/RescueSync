import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { esAdmin } from '../../common/enums/rol.enum';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthenticatedUser, JwtPayload } from '../interfaces/jwt-payload.interface';
import { SessionRevocationService } from '../session-revocation.service';

/**
 * Equivalente al JwtAuthenticationFilter de Spring Security.
 *
 * Passport extrae el token del header Authorization, valida firma y expiracion,
 * y recien entonces llama a validate(). Lo que devuelve validate() se inyecta
 * en request.user.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  private readonly esProduccion: boolean;

  constructor(
    config: ConfigService,
    private readonly revocacion: SessionRevocationService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('jwt.secret'),
      passReqToCallback: true,
    });
    this.esProduccion = config.get<string>('app.env') === 'production';
  }

  async validate(
    req: { headers: { authorization?: string } },
    payload: JwtPayload,
  ): Promise<AuthenticatedUser> {
    const token = req.headers.authorization?.replace('Bearer ', '') ?? '';

    // Un token puede ser criptograficamente valido y aun asi estar revocado,
    // sea porque se hizo logout con el o porque el usuario se dio de baja.
    if (await this.revocacion.estaRevocado(token, payload.sub)) {
      throw new UnauthorizedException('Sesion finalizada');
    }

    // El superusuario de desarrollo no existe en produccion, aunque alguien
    // lo haya dejado cargado en la base.
    if (this.esProduccion && esAdmin(payload.rol)) {
      throw new UnauthorizedException('El perfil ADMIN esta deshabilitado en produccion');
    }

    return {
      id: payload.sub,
      email: payload.email,
      rol: payload.rol,
      organizacionId: payload.organizacionId ?? null,
    };
  }
}
