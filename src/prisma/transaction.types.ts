import { Prisma } from '@prisma/client';

/**
 * Cliente transaccional de Prisma.
 *
 * Prisma NO tiene un equivalente a @Transactional: la transaccion no viaja en
 * un ThreadLocal, se pasa explicitamente. Los repositorios reciben este tipo
 * como parametro opcional para poder participar de una transaccion abierta
 * por el servicio:
 *
 *   await this.prisma.$transaction(async (tx) => {
 *     const emergencia = await this.emergenciaRepo.create(dto, tx);
 *     await this.loteRepo.createMany(lotes, emergencia.id, tx);
 *   });
 *
 * Es mas verboso que Spring, pero elimina las sorpresas de propagacion
 * (self-invocation, REQUIRES_NEW, proxies que no se aplican).
 */
export type PrismaTransaction = Prisma.TransactionClient;

/** Cliente completo o transaccional: lo que aceptan los metodos de repositorio. */
export type PrismaClientOrTx = PrismaTransaction | import('./prisma.service').PrismaService;
