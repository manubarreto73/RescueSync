/**
 * Los 4 perfiles que exige la consigna para el RBAC.
 * Se guardan como texto en Postgres para que las migraciones sean legibles.
 */
export enum Rol {
  OPERADOR_MUNICIPAL = 'OPERADOR_MUNICIPAL',
  CENTRO_COORDINADOR = 'CENTRO_COORDINADOR',
  REPRESENTANTE_ONG = 'REPRESENTANTE_ONG',
  AUDITOR = 'AUDITOR',
  /**
   * Superusuario para desarrollo: pasa todos los @Roles, ve todas las filas y
   * saltea los chequeos de duenio y de lider. No es un perfil de la consigna:
   * solo lo crea el seed y JwtStrategy lo rechaza con NODE_ENV=production.
   *
   * Lo que no puede hacer es lo que depende de tener organizacion (registrar
   * una emergencia, crear una oferta, finalizar una participacion): para eso
   * siguen estando los usuarios del seed.
   */
  ADMIN = 'ADMIN',
}

export const esAdmin = (rol: Rol): boolean => rol === Rol.ADMIN;
