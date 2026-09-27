/**
 * Los 4 perfiles que exige la consigna para el RBAC.
 * Se guardan como texto en Postgres para que las migraciones sean legibles.
 */
export enum Rol {
  OPERADOR_MUNICIPAL = 'OPERADOR_MUNICIPAL',
  CENTRO_COORDINADOR = 'CENTRO_COORDINADOR',
  REPRESENTANTE_ONG = 'REPRESENTANTE_ONG',
  AUDITOR = 'AUDITOR',
}
