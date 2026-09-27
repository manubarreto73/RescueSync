import { SetMetadata } from '@nestjs/common';
import { Rol } from '../enums/rol.enum';

export const ROLES_KEY = 'roles';

/**
 * Restringe un endpoint a ciertos perfiles.
 * Equivale a @PreAuthorize("hasRole('...')") de Spring Security.
 */
export const Roles = (...roles: Rol[]) => SetMetadata(ROLES_KEY, roles);
