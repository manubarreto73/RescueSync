import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({ description: 'Refresh token entregado en el login' })
  @IsString()
  @Length(32, 200)
  refreshToken!: string;
}
