import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate } from 'class-validator';
import { Futura } from '../../../../common/validators/futura.validator';

export class PublicarConvocatoriaDto {
  @ApiProperty({
    example: '2026-10-01T18:00:00.000Z',
    description: 'Cierre de la ventana de recepcion de ofertas',
  })
  @Type(() => Date)
  @IsDate({ message: 'La fecha de cierre no es una fecha valida' })
  @Futura({ message: 'La fecha de cierre de convocatoria tiene que estar en el futuro' })
  fechaCierreConvocatoria!: Date;
}
