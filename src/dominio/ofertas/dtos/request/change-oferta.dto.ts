import { OmitType } from '@nestjs/swagger';
import { RegisterOfertaDto } from './register-oferta.dto';

/**
 * Edicion dentro de la ventana de convocatoria.
 *
 * Se omite emergenciaId: mover una oferta de una emergencia a otra no es
 * editarla, es presentarla de nuevo en otro lado.
 */
export class ChangeOfertaDto extends OmitType(RegisterOfertaDto, ['emergenciaId'] as const) {}
