import { Inject, Injectable, forwardRef } from '@nestjs/common';
import { EstadoEmergencia, Lote } from '@prisma/client';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { ResourceNotFoundException } from '../../../common/exceptions/resource-not-found.exception';
import { AuthenticatedUser } from '../../../security/interfaces/jwt-payload.interface';
import { EmergenciasService } from '../../emergencias/services/emergencias.service';
import { LoteResponseDto } from '../dtos/lote-response.dto';
import { ChangeLoteDto } from '../dtos/request/change-lote.dto';
import { RegisterLoteDto } from '../dtos/request/register-lote.dto';
import { LoteRepository } from '../repositories/lote.repository';

/**
 * Estados de la emergencia en los que el Coordinador todavia puede tocar los
 * lotes.
 *
 * REGISTRADA es el desglose inicial. CONVOCATORIA_CERRADA esta porque la
 * consigna lo pide explicitamente: cuando vence el temporizador sin cobertura
 * completa, una de las salidas del Coordinador es "reformular lotes".
 *
 * Con la convocatoria ABIERTA no se tocan: las ONGs estan ofertando sobre
 * ellos en ese preciso momento, y cambiar una cantidad debajo de una oferta
 * en curso la invalidaria sin que nadie se entere.
 */
const ESTADOS_EDITABLES: EstadoEmergencia[] = [
  EstadoEmergencia.REGISTRADA,
  EstadoEmergencia.CONVOCATORIA_CERRADA,
];

@Injectable()
export class LotesService {
  constructor(
    private readonly loteRepository: LoteRepository,
    // forwardRef en los DOS lados del ciclo emergencias <-> lotes: marcarlo
    // en uno solo compila, pero falla al levantar la app.
    @Inject(forwardRef(() => EmergenciasService))
    private readonly emergenciasService: EmergenciasService,
  ) {}

  async getByEmergencia(emergenciaId: number, user: AuthenticatedUser): Promise<LoteResponseDto[]> {
    // Delega el control de acceso: si el usuario no puede ver la emergencia,
    // tampoco sus lotes. La regla vive en un solo lugar.
    await this.emergenciasService.findVisible(emergenciaId, user);

    const lotes = await this.loteRepository.findByEmergencia(emergenciaId);

    // La cobertura se calcula al leer, con un GROUP BY sobre las lineas de
    // las ofertas adjudicadas. Un contador denormalizado se desincronizaria
    // en cuanto alguien retire una oferta, y un numero de cobertura
    // equivocado hace que el Coordinador decida mal.
    const cobertura = await this.loteRepository.coberturaPorLote(emergenciaId);

    return lotes.map((lote) => LoteResponseDto.from(lote, cobertura.get(lote.id) ?? 0));
  }

  async create(
    emergenciaId: number,
    dto: RegisterLoteDto,
    user: AuthenticatedUser,
  ): Promise<LoteResponseDto> {
    await this.exigirEmergenciaEditable(emergenciaId, user);

    if (await this.loteRepository.existsDescripcionEnEmergencia(emergenciaId, dto.descripcion)) {
      throw new BusinessException(
        'Ya hay un lote con esa descripcion en esta emergencia. ' +
          'Si son necesidades distintas, diferencialas; si es la misma, aumenta la cantidad.',
      );
    }

    const lote = await this.loteRepository.create({
      categoria: dto.categoria,
      descripcion: dto.descripcion,
      cantidadRequerida: dto.cantidadRequerida,
      unidad: dto.unidad,
      emergencia: { connect: { id: emergenciaId } },
    });

    return LoteResponseDto.from(lote);
  }

  async update(
    emergenciaId: number,
    id: number,
    dto: ChangeLoteDto,
    user: AuthenticatedUser,
  ): Promise<LoteResponseDto> {
    await this.exigirEmergenciaEditable(emergenciaId, user);

    const lote = await this.findEnEmergencia(emergenciaId, id);

    if (
      await this.loteRepository.existsDescripcionEnEmergencia(emergenciaId, dto.descripcion, id)
    ) {
      throw new BusinessException('Ya hay otro lote con esa descripcion en esta emergencia');
    }

    const actualizado = await this.loteRepository.update(lote.id, {
      categoria: dto.categoria,
      descripcion: dto.descripcion,
      cantidadRequerida: dto.cantidadRequerida,
      unidad: dto.unidad,
    });

    return LoteResponseDto.from(actualizado);
  }

  /**
   * Borrado fisico y no logico, al reves que en usuarios y organizaciones.
   *
   * El motivo es que un lote solo se puede borrar antes de que exista
   * cualquier oferta sobre el: no hay historia que preservar, es un borrador.
   * Una baja logica aca solo aportaria filas fantasma que habria que filtrar
   * en cada consulta.
   */
  async delete(emergenciaId: number, id: number, user: AuthenticatedUser): Promise<void> {
    await this.exigirEmergenciaEditable(emergenciaId, user);

    const lote = await this.findEnEmergencia(emergenciaId, id);

    /**
     * Si alguna oferta lo referencia, borrarlo se llevaria por delante lo que
     * una ONG ya ofrecio. Reformular en ese caso es editar la cantidad, no
     * eliminar el lote.
     */
    if (await this.loteRepository.tieneOfertas(lote.id)) {
      throw new BusinessException(
        'No se puede borrar el lote: ya hay ofertas que lo referencian. ' +
          'Si la necesidad cambio, reformule la cantidad en vez de eliminarlo.',
      );
    }

    await this.loteRepository.delete(lote.id);
  }

  /** Lo consulta EmergenciasService antes de publicar la convocatoria. */
  async contarPorEmergencia(emergenciaId: number): Promise<number> {
    return this.loteRepository.contarPorEmergencia(emergenciaId);
  }

  // ------------------------------------------------------------------

  private async exigirEmergenciaEditable(
    emergenciaId: number,
    user: AuthenticatedUser,
  ): Promise<void> {
    const emergencia = await this.emergenciasService.findVisible(emergenciaId, user);

    if (!ESTADOS_EDITABLES.includes(emergencia.estado)) {
      throw new BusinessException(
        `No se pueden modificar los lotes: la emergencia esta en estado ` +
          `${emergencia.estado} y solo se permite en ${ESTADOS_EDITABLES.join(' o ')}`,
      );
    }
  }

  /**
   * El lote tiene que pertenecer a la emergencia de la URL.
   *
   * Sin esta verificacion, /emergencias/1/lotes/99 editaria el lote 99 aunque
   * sea de otra emergencia: la ruta anidada seria decorativa y el control de
   * acceso sobre la emergencia, inutil.
   */
  private async findEnEmergencia(emergenciaId: number, id: number): Promise<Lote> {
    const lote = await this.loteRepository.findById(id);

    if (!lote || lote.emergenciaId !== emergenciaId) {
      throw new ResourceNotFoundException(
        `Lote ${id} no encontrado en la emergencia ${emergenciaId}`,
      );
    }

    return lote;
  }
}
