/**
 * Namespaces de claves en Redis. Equivalente al enum RedisKeys de Stockeate.
 *
 * Centralizar la construccion de claves evita typos y colisiones entre modulos:
 * ninguna parte del codigo arma strings de Redis a mano.
 */
export const RedisKeys = {
  /** Access token revocado por logout. TTL = lo que le quedaba de vida. */
  blacklist: (token: string) => `blacklist:${token}`,

  /**
   * Usuario dado de baja. Invalida TODOS sus access tokens de una, sin
   * necesidad de conocerlos.
   *
   * Hace falta porque un JWT no se puede revocar: una vez firmado es valido
   * hasta que expira. Sin esta marca, un usuario dado de baja seguiria
   * operando normalmente durante los 15 minutos que le queden de token.
   *
   * El TTL es la vida del access token: pasado ese rato, cualquier token
   * emitido antes de la baja ya expiro por su cuenta.
   */
  usuarioRevocado: (usuarioId: number) => `usuario_revocado:${usuarioId}`,

  /**
   * Refresh token vigente. La clave es el token (no el id de usuario) para
   * que un mismo usuario pueda tener varias sesiones abiertas (notebook y
   * celular) sin que una desloguee a la otra.
   */
  refreshToken: (token: string) => `refresh:${token}`,

  /** Indice inverso: todos los refresh tokens de un usuario, para cerrar todas sus sesiones. */
  refreshTokensDeUsuario: (usuarioId: number) => `refresh_usuario:${usuarioId}`,

  /** Contador de intentos fallidos de login por IP. */
  loginAttempts: (ip: string) => `login_attempts:${ip}`,

  /** IP bloqueada por exceso de intentos. */
  blockedIp: (ip: string) => `blocked_ip:${ip}`,

  /** Token de recupero de contrasena. */
  resetPassword: (token: string) => `reset_password:${token}`,

  /** Cache del listado consolidado de ofertas que Bonita consulta al vencer el timer. */
  ofertasEmergencia: (emergenciaId: number) => `ofertas:emergencia:${emergenciaId}`,
} as const;
