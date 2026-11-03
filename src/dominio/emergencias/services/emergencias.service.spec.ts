import { EstadoEmergencia } from '@prisma/client';
import { Rol } from '../../../common/enums/rol.enum';
import { AuthenticatedUser } from '../../../security/interfaces/jwt-payload.interface';
import { EmergenciasService } from './emergencias.service';

/**
 * Qué le avisa cada transición al motor. Los e2e corren con Bonita apagado, así
 * que este es el control de que la app le pide a Bonita lo que corresponde.
 */
describe('EmergenciasService con un caso en Bonita', () => {
  const CASO = '1001';
  const FECHA = new Date('2026-11-05T18:00:00.000Z');
  const coordinador = { id: 1, rol: Rol.CENTRO_COORDINADOR } as AuthenticatedUser;
  const municipio = { id: 2, rol: Rol.OPERADOR_MUNICIPAL, organizacionId: 7 } as AuthenticatedUser;

  function armar(estado: EstadoEmergencia) {
    const emergencia = { id: 42, estado, municipioId: 7, bonitaCaseId: CASO };
    const bonita = {
      iniciarCaso: jest.fn().mockResolvedValue('1002'),
      publicarConvocatoria: jest.fn().mockResolvedValue(undefined),
      registrarDecision: jest.fn().mockResolvedValue(undefined),
      adjudicar: jest.fn().mockResolvedValue(undefined),
      finalizarProyecto: jest.fn().mockResolvedValue(undefined),
    };
    const repositorio = {
      findById: jest.fn().mockResolvedValue(emergencia),
      update: jest.fn().mockResolvedValue({
        ...emergencia,
        municipio: { nombre: 'Municipio' },
        registradaPor: { nombreCompleto: 'Operador' },
      }),
    };
    const lotes = { contarPorEmergencia: jest.fn().mockResolvedValue(1) };
    const notificaciones = { notificarConvocatoria: jest.fn().mockResolvedValue(undefined) };

    const servicio = new EmergenciasService(
      repositorio as never,
      lotes as never,
      bonita as never,
      notificaciones as never,
    );

    return { servicio, bonita, repositorio };
  }

  it('publicar le pasa la fecha de cierre al temporizador', async () => {
    const { servicio, bonita } = armar(EstadoEmergencia.REGISTRADA);

    await servicio.publicarConvocatoria(42, { fechaCierreConvocatoria: FECHA }, coordinador);

    expect(bonita.publicarConvocatoria).toHaveBeenCalledWith(CASO, FECHA);
  });

  it('reabrir completa la decisión y le pasa la fecha nueva al caso nuevo', async () => {
    const { servicio, bonita } = armar(EstadoEmergencia.CONVOCATORIA_CERRADA);

    await servicio.reabrirConvocatoria(42, { fechaCierreConvocatoria: FECHA }, coordinador);

    expect(bonita.registrarDecision).toHaveBeenCalledWith(CASO, 'REABRIR');
    expect(bonita.publicarConvocatoria).toHaveBeenCalledWith('1002', FECHA);
  });

  it('continuar completa la decisión', async () => {
    const { servicio, bonita } = armar(EstadoEmergencia.CONVOCATORIA_CERRADA);

    await servicio.habilitarAdjudicacion(42, coordinador);

    expect(bonita.registrarDecision).toHaveBeenCalledWith(CASO, 'CONTINUAR');
  });

  it('adjudicar completa la tarea del municipio', async () => {
    const { servicio, bonita } = armar(EstadoEmergencia.EN_ADJUDICACION);

    await servicio.adjudicar(42, municipio);

    expect(bonita.adjudicar).toHaveBeenCalledWith(CASO);
  });

  it('finalizar completa la tarea de cierre', async () => {
    const { servicio, bonita } = armar(EstadoEmergencia.EN_EJECUCION);

    await servicio.finalizar(42, coordinador);

    expect(bonita.finalizarProyecto).toHaveBeenCalledWith(CASO);
  });

  it('si el motor falla al adjudicar, la emergencia no avanza', async () => {
    const { servicio, bonita, repositorio } = armar(EstadoEmergencia.EN_ADJUDICACION);
    bonita.adjudicar.mockRejectedValue(new Error('Bonita caido'));

    await expect(servicio.adjudicar(42, municipio)).rejects.toThrow('Bonita caido');

    expect(repositorio.update).not.toHaveBeenCalled();
  });
});
