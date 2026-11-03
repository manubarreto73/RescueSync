import { calcularTiemposPorEtapa } from './tiempos-por-etapa';

describe('calcularTiemposPorEtapa', () => {
  it('mide cada etapa desde el fin de la tarea anterior y promedia entre casos', () => {
    const tiempos = calcularTiemposPorEtapa([
      // Caso 1: registrar tarda 1 h y generar lotes 2 h.
      {
        name: 'Generar lotes',
        caseId: '1',
        state: 'completed',
        reached_state_date: '2026-11-02 11:00:00.000',
        archivedDate: '2026-11-02 13:00:00.000',
      },
      {
        name: 'Registrar emergencia',
        caseId: '1',
        state: 'completed',
        reached_state_date: '2026-11-02 10:00:00.000',
        archivedDate: '2026-11-02 11:00:00.000',
      },
      // Caso 2: registrar tarda 3 h.
      {
        name: 'Registrar emergencia',
        caseId: '2',
        state: 'completed',
        reached_state_date: '2026-11-03 10:00:00.000',
        archivedDate: '2026-11-03 13:00:00.000',
      },
    ]);

    expect(tiempos).toEqual(
      expect.arrayContaining([
        { etapa: 'Registrar emergencia', casos: 2, promedioHoras: 2 },
        { etapa: 'Generar lotes', casos: 1, promedioHoras: 2 },
      ]),
    );
    expect(tiempos).toHaveLength(2);
  });

  it('ignora las tareas que no terminaron completadas', () => {
    expect(
      calcularTiemposPorEtapa([
        {
          name: 'Cargar / editar ofertas',
          caseId: '1',
          state: 'aborted',
          reached_state_date: '2026-11-02 10:00:00.000',
          archivedDate: '2026-11-02 11:00:00.000',
        },
      ]),
    ).toEqual([]);
  });
});
