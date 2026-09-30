import { Module } from '@nestjs/common';
import { BonitaProcesoService } from './bonita-proceso.service';
import { BonitaClient } from './bonita.client';

/**
 * Integracion saliente con Bonita: la API le habla al motor.
 *
 * El sentido inverso (Bonita llamando a la API desde un conector) no pasa por
 * aca: entra por los controllers de siempre, autenticado con el token de
 * servicio. Ver @AccesoServicio.
 *
 * Solo se exporta el servicio de proceso: nadie fuera de este modulo tiene
 * por que conocer el dialecto REST de Bonita.
 */
@Module({
  providers: [BonitaClient, BonitaProcesoService],
  exports: [BonitaProcesoService],
})
export class BonitaModule {}
