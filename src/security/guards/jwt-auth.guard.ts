import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { timingSafeEqual } from 'crypto';
import { ACCESO_SERVICIO_KEY } from '../../common/decorators/acceso-servicio.decorator';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import { Rol } from '../../common/enums/rol.enum';
import { AuthenticatedUser } from '../interfaces/jwt-payload.interface';

export const SERVICE_TOKEN_HEADER = 'x-service-token';

/**
 * Identidad con la que opera Bonita. Coordinador porque es el perfil que
 * tienen las transiciones que dispara el proceso; id 0 porque no es una fila
 * de usuarios.
 */
export const USUARIO_BONITA: AuthenticatedUser = {
  id: 0,
  email: 'bonita@servicio.rescuesync',
  rol: Rol.CENTRO_COORDINADOR,
  organizacionId: null,
};

/**
 * Guard global de autenticacion.
 *
 * Se registra como APP_GUARD, asi que TODO endpoint exige token por defecto
 * (equivalente a .anyRequest().authenticated()). Los endpoints abiertos se
 * marcan explicitamente con @Public(), y los que puede llamar Bonita con su
 * token de servicio, con @AccesoServicio().
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  private readonly serviceToken: Buffer | null;

  constructor(
    private readonly reflector: Reflector,
    config: ConfigService,
  ) {
    super();
    const token = config.get<string>('bonita.callbackToken');
    this.serviceToken = token ? Buffer.from(token) : null;
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) return true;

    const aceptaServicio = this.reflector.getAllAndOverride<boolean>(ACCESO_SERVICIO_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (aceptaServicio) {
      const request = context.switchToHttp().getRequest<{
        headers: Record<string, string | string[] | undefined>;
        user?: AuthenticatedUser;
      }>();
      const recibido = request.headers[SERVICE_TOKEN_HEADER];

      // Si el header viene, decide el: un token de servicio invalido no cae
      // al JWT, se rechaza.
      if (recibido !== undefined) {
        if (typeof recibido === 'string' && this.tokenValido(recibido)) {
          request.user = USUARIO_BONITA;
          return true;
        }
        throw new UnauthorizedException('Token de servicio invalido');
      }
    }

    return super.canActivate(context);
  }

  /** Comparacion en tiempo constante, para no filtrar el token por timing. */
  private tokenValido(recibido: string): boolean {
    if (!this.serviceToken) return false;
    const candidato = Buffer.from(recibido);
    return (
      candidato.length === this.serviceToken.length && timingSafeEqual(candidato, this.serviceToken)
    );
  }
}
