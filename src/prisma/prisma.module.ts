import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * @Global para no tener que importarlo en cada modulo de dominio,
 * igual que el DataSource de Spring esta disponible en todo el contexto.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
