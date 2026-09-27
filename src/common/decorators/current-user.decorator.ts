import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import { AuthenticatedUser } from '../../security/interfaces/jwt-payload.interface';

/**
 * Inyecta el usuario autenticado en el metodo del controller.
 * Equivale a @AuthenticationPrincipal de Spring Security.
 *
 *   getMisOfertas(@CurrentUser() user: AuthenticatedUser) { ... }
 */
export const CurrentUser = createParamDecorator(
  (data: keyof AuthenticatedUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<{ user: AuthenticatedUser }>();
    return data ? request.user?.[data] : request.user;
  },
);
