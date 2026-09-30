import { SetMetadata } from '@nestjs/common';

export const ACCESO_SERVICIO_KEY = 'accesoServicio';

/**
 * Habilita el endpoint para Bonita, que llama a la API desde sus conectores
 * con el header X-Service-Token en vez de un JWT de usuario.
 *
 * Opt-in por endpoint y no global: el token actua como CENTRO_COORDINADOR, y
 * si se filtrara solo tendria que poder hacer lo que el proceso necesita
 * (cerrar la convocatoria, leer el consolidado, cargar la validacion).
 */
export const AccesoServicio = () => SetMetadata(ACCESO_SERVICIO_KEY, true);
