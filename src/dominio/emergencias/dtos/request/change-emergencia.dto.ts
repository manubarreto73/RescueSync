import { RegisterEmergenciaDto } from './register-emergencia.dto';

/**
 * Correccion de lo cargado.
 *
 * Lleva los mismos campos que el alta: el municipio manda el estado completo
 * que quiere dejar, no un parche. Lo que acota esta operacion no son los
 * campos sino el estado: solo se puede editar mientras la emergencia esta
 * REGISTRADA, porque una vez publicada la convocatoria las ONGs ya ofertaron
 * sobre la informacion original.
 */
export class ChangeEmergenciaDto extends RegisterEmergenciaDto {}
