import { RegisterLoteDto } from './register-lote.dto';

/**
 * Los mismos campos que el alta: el coordinador manda el estado completo del
 * lote, no un parche. Lo que acota esta operacion es el estado de la
 * emergencia, no los campos.
 */
export class ChangeLoteDto extends RegisterLoteDto {}
