import { ApiProperty } from '@nestjs/swagger';
import { UsuarioResponseDto } from '../../usuarios/dtos/usuario-response.dto';

/** Lo que devuelve el login y el refresh. */
export class AuthResponseDto {
  @ApiProperty({ description: 'JWT de vida corta que va en el header Authorization' })
  accessToken!: string;

  @ApiProperty({ description: 'Token opaco de vida larga, de un solo uso' })
  refreshToken!: string;

  @ApiProperty({ example: 'Bearer' })
  tokenType = 'Bearer';

  @ApiProperty({ description: 'Segundos de validez del access token', example: 900 })
  expiresIn!: number;

  @ApiProperty({ type: UsuarioResponseDto })
  usuario!: UsuarioResponseDto;
}
