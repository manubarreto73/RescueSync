import { ApiProperty } from '@nestjs/swagger';
import { Notificacion, TipoNotificacion } from '@prisma/client';

export class NotificacionResponseDto {
  @ApiProperty() id!: number;
  @ApiProperty() emergenciaId!: number;
  @ApiProperty({ enum: TipoNotificacion }) tipo!: TipoNotificacion;
  @ApiProperty() mensaje!: string;
  @ApiProperty() leida!: boolean;
  @ApiProperty() fechaCreacion!: Date;

  static from(notificacion: Notificacion): NotificacionResponseDto {
    const dto = new NotificacionResponseDto();
    dto.id = notificacion.id;
    dto.emergenciaId = notificacion.emergenciaId;
    dto.tipo = notificacion.tipo;
    dto.mensaje = notificacion.mensaje;
    dto.leida = notificacion.leida;
    dto.fechaCreacion = notificacion.fechaCreacion;
    return dto;
  }
}
