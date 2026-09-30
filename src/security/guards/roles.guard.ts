import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { Rol, esAdmin } from '../../common/enums/rol.enum';
import { AuthenticatedUser } from '../interfaces/jwt-payload.interface';

/**
 * Guard global de autorizacion (RBAC).
 *
 * Corre despues de JwtAuthGuard: para cuando llega aca, request.user ya existe.
 * Si el endpoint no declara @Roles(...), no restringe nada.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const rolesRequeridos = this.reflector.getAllAndOverride<Rol[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!rolesRequeridos || rolesRequeridos.length === 0) return true;

    const { user } = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();

    if (user && esAdmin(user.rol)) return true;

    if (!user || !rolesRequeridos.includes(user.rol)) {
      throw new ForbiddenException('No tiene permisos para realizar esta operacion');
    }

    return true;
  }
}
