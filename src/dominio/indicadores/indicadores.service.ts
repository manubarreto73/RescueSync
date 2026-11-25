import { Injectable } from '@nestjs/common';
import { CategoriaRecurso, EstadoEmergencia } from '@prisma/client';
import { BonitaProcesoService } from '../../integracion/bonita/bonita-proceso.service';
import { CoberturaDto, IndicadoresResponseDto, SuministroDto } from './dtos/indicadores.dto';
import { IndicadoresRepository } from './indicadores.repository';

/** Combina los datos propios con los que se leen de la API de Bonita. */
@Injectable()
export class IndicadoresService {
  constructor(
    private readonly indicadoresRepository: IndicadoresRepository,
    private readonly bonita: BonitaProcesoService,
  ) {}

  async obtener(mes?: string): Promise<IndicadoresResponseDto> {
    const periodo = mes ?? new Date().toISOString().slice(0, 7);

    const [suministrosMovilizados, consorcios, cobertura, proyectos, etapas] = await Promise.all([
      this.suministros(periodo),
      this.consorcios(),
      this.cobertura(),
      this.proyectos(),
      this.bonita.tiemposPorEtapa(),
    ]);

    return {
      mes: periodo,
      suministrosMovilizados,
      consorcios,
      cobertura,
      proyectos,
      tiemposPorEtapa: { disponible: etapas !== null, etapas: etapas ?? [] },
    };
  }

  private async suministros(periodo: string): Promise<SuministroDto[]> {
    const [anio, mes] = periodo.split('-').map(Number);
    const lineas = await this.indicadoresRepository.lineasAdjudicadas(
      new Date(Date.UTC(anio, mes - 1, 1)),
      new Date(Date.UTC(anio, mes, 1)),
    );

    // Por categoria y unidad: 5 personas y 1000 raciones no se pueden sumar.
    const totales = new Map<string, SuministroDto>();
    for (const { cantidad, lote } of lineas) {
      const clave = `${lote.categoria}|${lote.unidad}`;
      const fila = totales.get(clave) ?? {
        categoria: lote.categoria as CategoriaRecurso,
        unidad: lote.unidad,
        cantidad: 0,
      };
      fila.cantidad += cantidad;
      totales.set(clave, fila);
    }

    return [...totales.values()].sort((a, b) => b.cantidad - a.cantidad);
  }

  private async consorcios() {
    const ofertas = await this.indicadoresRepository.ofertasAdjudicadas();
    const enConsorcio = ofertas.filter((o) => o._count.participantes > 1).length;

    return {
      ofertasAdjudicadas: ofertas.length,
      enConsorcio,
      porcentaje: ofertas.length ? Math.round((enConsorcio / ofertas.length) * 1000) / 10 : 0,
    };
  }

  /**
   * Cuanto de lo requerido cubrio lo adjudicado, en las emergencias que ya
   * pasaron la adjudicacion. Cada lote aporta su porcentaje (tope 100: lo que
   * sobra en un lote no compensa lo que falta en otro), y una emergencia tiene
   * cobertura total solo si todos sus lotes estan cubiertos. Las parciales son
   * las que el Coordinador decidio continuar sin completar los lotes.
   */
  private async cobertura(): Promise<CoberturaDto> {
    const lotes = await this.indicadoresRepository.lotesAdjudicados();

    const coberturaDe = (lote: (typeof lotes)[number]) => {
      const adjudicado = lote.lineasDeOferta.reduce((suma, l) => suma + l.cantidad, 0);
      return Math.min(1, adjudicado / lote.cantidadRequerida);
    };

    const completaPorEmergencia = new Map<number, boolean>();
    const porCategoria = new Map<CategoriaRecurso, { lotes: number; suma: number }>();
    let sumaTotal = 0;
    let lotesCubiertos = 0;

    for (const lote of lotes) {
      const cobertura = coberturaDe(lote);
      const cubierto = cobertura === 1;

      sumaTotal += cobertura;
      if (cubierto) lotesCubiertos++;

      completaPorEmergencia.set(
        lote.emergenciaId,
        (completaPorEmergencia.get(lote.emergenciaId) ?? true) && cubierto,
      );

      const categoria = porCategoria.get(lote.categoria) ?? { lotes: 0, suma: 0 };
      categoria.lotes++;
      categoria.suma += cobertura;
      porCategoria.set(lote.categoria, categoria);
    }

    const porcentaje = (suma: number, cantidad: number) =>
      cantidad ? Math.round((suma / cantidad) * 1000) / 10 : 0;
    const completas = [...completaPorEmergencia.values()].filter(Boolean).length;

    return {
      emergencias: completaPorEmergencia.size,
      conCoberturaTotal: completas,
      conCoberturaParcial: completaPorEmergencia.size - completas,
      totalLotes: lotes.length,
      lotesCubiertos,
      porcentaje: porcentaje(sumaTotal, lotes.length),
      porCategoria: [...porCategoria.entries()]
        .map(([categoria, { lotes, suma }]) => ({
          categoria,
          lotes,
          porcentaje: porcentaje(suma, lotes),
        }))
        .sort((a, b) => a.porcentaje - b.porcentaje),
    };
  }

  private async proyectos() {
    const filas = await this.indicadoresRepository.emergenciasPorEstado();
    const porEstado = filas.map((f) => ({ estado: f.estado, cantidad: f._count._all }));

    return {
      total: porEstado.reduce((suma, f) => suma + f.cantidad, 0),
      finalizados: porEstado.find((f) => f.estado === EstadoEmergencia.FINALIZADA)?.cantidad ?? 0,
      porEstado,
    };
  }
}
