import { Rol } from '../../common/enums/rol.enum';

/**
 * Contenido (claims) del access token.
 *
 * Regla: aca va lo minimo para autorizar sin ir a la base, y nada sensible.
 * El JWT esta firmado, no cifrado: cualquiera que lo intercepte puede leer
 * su contenido en jwt.io.
 *
 * organizacionId viaja en el token para poder acotar el acceso por filas sin
 * ir a la base en cada request. Es null para los perfiles que no pertenecen a
 * ninguna organizacion (coordinador y auditor).
 */
export interface JwtPayload {
  /** subject: id del usuario */
  sub: number;
  email: string;
  rol: Rol;
  organizacionId: number | null;
  iat?: number;
  exp?: number;
}

/** Lo que queda disponible en request.user una vez validado el token. */
export interface AuthenticatedUser {
  id: number;
  email: string;
  rol: Rol;
  organizacionId: number | null;
}
