import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marca un endpoint como accesible sin token.
 * Equivale a .requestMatchers("/auth/**").permitAll() en SecurityConfig.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
