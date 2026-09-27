import { Module, forwardRef } from '@nestjs/common';
import { EmergenciasModule } from '../emergencias/emergencias.module';
import { LotesController } from './controller/lotes.controller';
import { LoteRepository } from './repositories/lote.repository';
import { LotesService } from './services/lotes.service';

/**
 * forwardRef porque hay una dependencia circular entre modulos:
 *
 *   lotes -> emergencias   para resolver el control de acceso a la emergencia
 *   emergencias -> lotes   para verificar, antes de publicar la convocatoria,
 *                          que haya al menos un lote cargado
 *
 * Es circular de verdad y no un error de diseno: las dos reglas son
 * legitimas y viven cada una en su dominio. forwardRef le dice a Nest que
 * resuelva uno de los dos lados mas tarde, cuando el grafo ya este armado.
 *
 * Importante: forwardRef va en LOS DOS modulos y tambien en LOS DOS
 * servicios. Declararlo en un solo lado compila sin problemas y falla recien
 * al levantar la app con un "Nest can't resolve dependencies".
 *
 * Con ofertas NO hay ciclo, y es deliberado: la cobertura de cada lote se
 * consulta desde LoteRepository en vez de pedirsela a OfertasService. Es una
 * lectura, no una regla de negocio ajena, y el repositorio es la capa que
 * puede consultar las tablas que necesite.
 */
@Module({
  imports: [forwardRef(() => EmergenciasModule)],
  controllers: [LotesController],
  providers: [LotesService, LoteRepository],
  exports: [LotesService],
})
export class LotesModule {}
