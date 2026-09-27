import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Public } from '../../../common/decorators/public.decorator';
import { AuthenticatedUser } from '../../../security/interfaces/jwt-payload.interface';
import { UsuarioResponseDto } from '../../usuarios/dtos/usuario-response.dto';
import { AuthResponseDto } from '../dtos/auth-response.dto';
import { LoginDto } from '../dtos/request/login.dto';
import { RefreshTokenDto } from '../dtos/request/refresh-token.dto';
import { AuthService } from '../services/auth.service';

@ApiTags('Auth')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * @Throttle sobreescribe el limite global solo para esta ruta. El login es
   * el endpoint mas atacado de cualquier API, asi que se le pone un techo
   * mucho mas bajo: 5 intentos por minuto contra los 120 generales.
   */
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ short: { limit: 3, ttl: 10_000 }, long: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Inicia sesion y devuelve el par de tokens' })
  @ApiResponse({ status: 200, type: AuthResponseDto })
  @ApiResponse({ status: 401, description: 'Credenciales invalidas' })
  @ApiResponse({ status: 429, description: 'Rate limit alcanzado o IP bloqueada' })
  login(@Body() dto: LoginDto, @Req() req: Request): Promise<AuthResponseDto> {
    return this.authService.login(dto, this.ipDe(req));
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ long: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Canjea el refresh token por un par nuevo (rotacion)' })
  @ApiResponse({ status: 200, type: AuthResponseDto })
  @ApiResponse({ status: 401, description: 'Refresh token invalido o ya usado' })
  refresh(@Body() dto: RefreshTokenDto): Promise<AuthResponseDto> {
    return this.authService.refresh(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Revoca el access token y borra el refresh token' })
  logout(@Req() req: Request, @Body() dto?: Partial<RefreshTokenDto>): Promise<void> {
    const accessToken = req.headers.authorization?.replace('Bearer ', '') ?? '';
    return this.authService.logout(accessToken, dto?.refreshToken);
  }

  @Get('me')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Datos del usuario autenticado' })
  @ApiResponse({ status: 200, type: UsuarioResponseDto })
  me(@CurrentUser() user: AuthenticatedUser): Promise<UsuarioResponseDto> {
    return this.authService.me(user.id);
  }

  /**
   * IP real del cliente. Express la resuelve mirando X-Forwarded-For solo si
   * 'trust proxy' esta habilitado (ver main.ts); si no, detras de nginx o de
   * Render todas las peticiones parecerian venir de la misma IP y el bloqueo
   * dejaria afuera a todo el mundo de una.
   */
  private ipDe(req: Request): string {
    return req.ip ?? req.socket.remoteAddress ?? 'desconocida';
  }
}
