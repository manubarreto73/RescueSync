/** Tarea humana terminada, tal como la devuelve /API/bpm/archivedHumanTask. */
export interface BonitaTareaArchivada {
  name: string;
  caseId: string;
  state?: string;
  /** Formato de Bonita: "2026-11-02 14:03:11.123". */
  reached_state_date: string;
  archivedDate: string;
}

export interface TiempoEtapa {
  etapa: string;
  casos: number;
  promedioHoras: number;
}

const HORA_MS = 60 * 60 * 1000;

function fecha(valor: string): number {
  return new Date(valor.replace(' ', 'T')).getTime();
}

/**
 * Tiempo promedio de cada etapa del proceso.
 *
 * En cada caso, una etapa dura desde que termino la tarea anterior hasta que
 * termino ella. La primera arranca cuando la tarea quedo lista.
 */
export function calcularTiemposPorEtapa(tareas: BonitaTareaArchivada[]): TiempoEtapa[] {
  const completadas = tareas.filter((t) => !t.state || t.state === 'completed');

  const porCaso = new Map<string, BonitaTareaArchivada[]>();
  for (const tarea of completadas) {
    porCaso.set(tarea.caseId, [...(porCaso.get(tarea.caseId) ?? []), tarea]);
  }

  const duraciones = new Map<string, number[]>();
  for (const delCaso of porCaso.values()) {
    delCaso.sort((a, b) => fecha(a.archivedDate) - fecha(b.archivedDate));

    delCaso.forEach((tarea, i) => {
      const inicio = i === 0 ? tarea.reached_state_date : delCaso[i - 1].archivedDate;
      const duracion = fecha(tarea.archivedDate) - fecha(inicio);
      duraciones.set(tarea.name, [...(duraciones.get(tarea.name) ?? []), duracion]);
    });
  }

  return [...duraciones].map(([etapa, valores]) => ({
    etapa,
    casos: valores.length,
    promedioHoras:
      Math.round((valores.reduce((a, b) => a + b, 0) / valores.length / HORA_MS) * 100) / 100,
  }));
}
