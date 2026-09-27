import { PickType } from '@nestjs/swagger';
import { RegisterOrganizacionDto } from './register-organizacion.dto';

/**
 * Lo que el referente de una organizacion puede editar de la suya: datos de
 * contacto y ubicacion, nada mas.
 *
 * Quedan afuera `nombre`, `tipo`, `cuit` y `codigoNacional` porque son datos
 * de identidad dentro de la red: el nombre y el CUIT los valida el Centro
 * Coordinador al dar el alta, y el codigo nacional es la clave con la que el
 * Sistema Nacional bloquea y libera recursos. Si una ONG pudiera cambiarlo
 * sola, podria apropiarse de los recursos comprometidos por otra.
 */
export class ChangeMiOrganizacionDto extends PickType(RegisterOrganizacionDto, [
  'emailContacto',
  'telefonoContacto',
  'localidad',
  'provincia',
] as const) {}
