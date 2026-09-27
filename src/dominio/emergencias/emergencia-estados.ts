import { EstadoEmergencia } from '@prisma/client';
import { Rol } from '../../common/enums/rol.enum';

/**
 * Maquina de estados de la emergencia.
 *
 * Esta en un archivo propio y no desparramada en ifs dentro del servicio por
 * una razon concreta: es la regla de negocio mas importante del sistema y
 * tiene que poder leerse de un vistazo. Cuando alguien pregunte "desde que
 * estado se puede cancelar", la respuesta esta en una tabla, no repartida en
 * ocho metodos.
 *
 * Cada transicion declara tres cosas:
 *   desde   estados en los que la accion es legal
 *   hacia   estado resultante
 *   quien   perfiles habilitados para ejecutarla
 *
 * El `quien` duplica en apariencia lo que dice el @Roles del controller, pero
 * no es lo mismo: el decorador corta el request antes de llegar al servicio,
 * y esta tabla es la que vale si manana el servicio se invoca desde otro
 * lado, por ejemplo desde un conector de Bonita o desde un job.
 */
export type AccionEmergencia =
  | 'publicar-convocatoria'
  | 'cerrar-convocatoria'
  | 'reabrir-convocatoria'
  | 'habilitar-adjudicacion'
  | 'adjudicar'
  | 'finalizar'
  | 'cancelar';

export interface Transicion {
  desde: EstadoEmergencia[];
  hacia: EstadoEmergencia;
  quien: Rol[];
  descripcion: string;
}

export const TRANSICIONES: Record<AccionEmergencia, Transicion> = {
  /** El Coordinador ya desgloso los lotes y abre la ventana de ofertas. */
  'publicar-convocatoria': {
    desde: [EstadoEmergencia.REGISTRADA],
    hacia: EstadoEmergencia.CONVOCATORIA_ABIERTA,
    quien: [Rol.CENTRO_COORDINADOR],
    descripcion: 'publicar la convocatoria',
  },

  /**
   * La dispara el temporizador de Bonita al vencer la ventana. El Coordinador
   * tambien puede forzarla: si los lotes ya estan cubiertos no tiene sentido
   * esperar al vencimiento.
   */
  'cerrar-convocatoria': {
    desde: [EstadoEmergencia.CONVOCATORIA_ABIERTA],
    hacia: EstadoEmergencia.CONVOCATORIA_CERRADA,
    quien: [Rol.CENTRO_COORDINADOR],
    descripcion: 'cerrar la convocatoria',
  },

  /**
   * El camino alternativo que pide la consigna: si vencio el timer y los
   * lotes no se cubrieron, el Coordinador puede volver a abrir la ventana con
   * una fecha nueva en vez de seguir con cobertura parcial.
   */
  'reabrir-convocatoria': {
    desde: [EstadoEmergencia.CONVOCATORIA_CERRADA],
    hacia: EstadoEmergencia.CONVOCATORIA_ABIERTA,
    quien: [Rol.CENTRO_COORDINADOR],
    descripcion: 'reabrir la convocatoria',
  },

  /** Ofertas validadas: el municipio ya puede elegir. */
  'habilitar-adjudicacion': {
    desde: [EstadoEmergencia.CONVOCATORIA_CERRADA],
    hacia: EstadoEmergencia.EN_ADJUDICACION,
    quien: [Rol.CENTRO_COORDINADOR],
    descripcion: 'habilitar la adjudicacion',
  },

  /** El municipio selecciono las ofertas y arranca el despliegue. */
  adjudicar: {
    desde: [EstadoEmergencia.EN_ADJUDICACION],
    hacia: EstadoEmergencia.EN_EJECUCION,
    quien: [Rol.OPERADOR_MUNICIPAL],
    descripcion: 'adjudicar',
  },

  /** Cierre operativo: se liberan los recursos a nivel nacional. */
  finalizar: {
    desde: [EstadoEmergencia.EN_EJECUCION],
    hacia: EstadoEmergencia.FINALIZADA,
    quien: [Rol.CENTRO_COORDINADOR],
    descripcion: 'finalizar',
  },

  /**
   * No se puede cancelar desde EN_EJECUCION: en ese punto ya hay recursos
   * comprometidos en el Sistema Nacional y gente movilizada. Abandonar un
   * despliegue en curso no es cancelar, es otro proceso.
   */
  cancelar: {
    desde: [
      EstadoEmergencia.REGISTRADA,
      EstadoEmergencia.CONVOCATORIA_ABIERTA,
      EstadoEmergencia.CONVOCATORIA_CERRADA,
      EstadoEmergencia.EN_ADJUDICACION,
    ],
    hacia: EstadoEmergencia.CANCELADA,
    quien: [Rol.OPERADOR_MUNICIPAL, Rol.CENTRO_COORDINADOR],
    descripcion: 'cancelar',
  },
};

/** Estados en los que la emergencia ya no admite ninguna accion. */
export const ESTADOS_TERMINALES: EstadoEmergencia[] = [
  EstadoEmergencia.FINALIZADA,
  EstadoEmergencia.CANCELADA,
];

/**
 * Estados a partir de los cuales la convocatoria es publica.
 *
 * Define que ve un REPRESENTANTE_ONG: una emergencia REGISTRADA todavia no se
 * difundio a la red, y filtrarla no es un detalle de privacidad sino del
 * proceso — el Coordinador todavia la esta desglosando en lotes.
 */
export const ESTADOS_VISIBLES_PARA_LA_RED: EstadoEmergencia[] = [
  EstadoEmergencia.CONVOCATORIA_ABIERTA,
  EstadoEmergencia.CONVOCATORIA_CERRADA,
  EstadoEmergencia.EN_ADJUDICACION,
  EstadoEmergencia.EN_EJECUCION,
  EstadoEmergencia.FINALIZADA,
];

/** Estado en el que el municipio todavia puede corregir lo que cargo. */
export const ESTADO_EDITABLE = EstadoEmergencia.REGISTRADA;
