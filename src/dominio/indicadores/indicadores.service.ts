import { Injectable } from '@nestjs/common';
import { CategoriaRecurso, EstadoEmergencia } from '@prisma/client';
import { BonitaProcesoService } from '../../integracion/bonita/bonita-proceso.service';
import { IndicadoresResponseDto, SuministroDto } from './dtos/indicadores.dto';
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

    const [suministrosMovilizados, consorcios, proyectos, etapas] = await Promise.all([
      this.suministros(periodo),
      this.consorcios(),
      this.proyectos(),
      this.bonita.tiemposPorEtapa(),
    ]);

    return {
      mes: periodo,
      suministrosMovilizados,
      consorcios,
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

  private async proyectos() {
    const filas = await this.indicadoresRepository.emergenciasPorEstado();
    const porEstado = filas.map((f) => ({ estado: f.estado, cantidad: f._count._all }));

    return {
      total: porEstado.reduce((suma, f) => suma + f.cantidad, 0),
      finalizados:
        porEstado.find((f) => f.estado === EstadoEmergencia.FINALIZADA)?.cantidad ?? 0,
      porEstado,
    };
  }
}
