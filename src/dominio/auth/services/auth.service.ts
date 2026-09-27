import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Usuario } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { Rol } from '../../../common/enums/rol.enum';
import { RedisKeys } from '../../../redis/redis.keys';
import { RedisService } from '../../../redis/redis.service';
import { PasswordService } from '../../../security/password.service';
import { SessionRevocationService } from '../../../security/session-revocation.service';
import { TokenService } from '../../../security/token.service';
import { UsuarioResponseDto } from '../../usuarios/dtos/usuario-response.dto';
import { UsuariosService } from '../../usuarios/services/usuarios.service';
import { AuthResponseDto } from '../dtos/auth-response.dto';
import { LoginDto } from '../dtos/request/login.dto';
import { LoginAttemptsService } from './login-attempts.service';

/**
 * Casos de uso de autenticacion.
 *
 * Esquema de tokens (el mismo de Stockeate):
 *   - accessToken:  JWT firmado, vida corta (15 min), viaja en cada request.
 *                   No se puede revocar por diseno, de ahi la blacklist.
 *   - refreshToken: string opaco aleatorio, vida larga (7 dias), guardado en
 *                   Redis. Es de UN SOLO USO: al canjearlo se borra y se
 *                   emite uno nuevo (rotacion).
 *
 * Por que el refresh es opaco y no otro JWT: porque un JWT es verificable
 * sin consultar el servidor, y justamente lo que queremos del refresh es
 * poder invalidarlo del lado nuestro.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly refreshTtlSegundos: number;

  constructor(
    private readonly usuariosService: UsuariosService,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
    private readonly loginAttempts: LoginAttemptsService,
    private readonly revocacion: SessionRevocationService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {
    this.refreshTtlSegundos = this.config.get<number>('jwt.refreshExpirationDays', 7) * 86400;
  }

  async login(dto: LoginDto, ip: string): Promise<AuthResponseDto> {
    const minutosBloqueo = await this.loginAttempts.minutosDeBloqueo(ip);

    if (minutosBloqueo > 0) {
      // 429 y no 400: el pedido es correcto, lo que falla es la frecuencia.
      // Ademas asi el front puede tratarlo igual que al 429 del throttler.
      throw new HttpException(
        `Demasiados intentos fallidos. Reintente en ${this.enMinutos(minutosBloqueo)}.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const usuario = await this.usuariosService.findByEmailParaLogin(dto.email);

    // Se compara el hash aunque el usuario no exista, para que el tiempo de
    // respuesta sea el mismo en ambos casos y no se pueda enumerar emails
    // midiendo la latencia.
    const hashDeReferencia = usuario?.password ?? '$2a$10$invalidinvalidinvalidinvalidinvalidinv';
    const passwordOk = await this.passwordService.compare(dto.password, hashDeReferencia);

    if (!usuario || !passwordOk) {
      const restantes = await this.loginAttempts.registrarFallo(ip);
      throw new UnauthorizedException(
        restantes > 0
          ? `Credenciales invalidas. ${this.intentosRestantes(restantes)}.`
          : 'Credenciales invalidas. La IP quedo bloqueada temporalmente.',
      );
    }

    if (!usuario.activo) {
      throw new UnauthorizedException('El usuario esta dado de baja');
    }

    await this.loginAttempts.limpiar(ip);
    await this.usuariosService.registrarAcceso(usuario.id);

    this.logger.log(`Login OK: ${usuario.email} (${usuario.rol})`);

    return this.emitirTokens(usuario);
  }

  /**
   * Canjea un refresh token por un par nuevo. El viejo se consume de forma
   * atomica con GETDEL: si dos requests concurrentes llegan con el mismo
   * token, solo uno se lo lleva.
   */
  async refresh(refreshToken: string): Promise<AuthResponseDto> {
    const usuarioId = await this.redis.getAndDelete(RedisKeys.refreshToken(refreshToken));

    if (!usuarioId) {
      throw new UnauthorizedException('Refresh token invalido o ya utilizado');
    }

    // findByIdParaAuth y no findById: findById filtra por activo y tiraria un
    // 404, que aca es doblemente incorrecto. Semanticamente el recurso que se
    // pidio es un token, no un usuario, y ademas un 404 le confirmaria a un
    // atacante que ese refresh token era valido.
    const usuario = await this.usuariosService.findByIdParaAuth(Number(usuarioId));

    if (!usuario || !usuario.activo) {
      throw new UnauthorizedException('El usuario ya no puede iniciar sesion');
    }

    return this.emitirTokens(usuario);
  }

  /**
   * Cierra la sesion. Dos pasos, porque son dos tokens distintos:
   *  1. el access token va a la blacklist por el tiempo que le quedara de vida
   *  2. el refresh token se borra de Redis
   */
  async logout(accessToken: string, refreshToken?: string): Promise<void> {
    await this.revocacion.revocarAccessToken(accessToken);

    if (refreshToken) {
      await this.revocacion.borrarRefreshToken(refreshToken);
    }
  }

  async me(usuarioId: number): Promise<UsuarioResponseDto> {
    return this.usuariosService.getById(usuarioId);
  }

  private async emitirTokens(usuario: Usuario): Promise<AuthResponseDto> {
    const accessToken = await this.tokenService.generateAccessToken({
      sub: usuario.id,
      email: usuario.email,
      rol: usuario.rol as Rol,
      organizacionId: usuario.organizacionId,
    });

    // 48 bytes de entropia criptografica: no es adivinable ni enumerable.
    const refreshToken = randomBytes(48).toString('hex');

    await this.redis.set(
      RedisKeys.refreshToken(refreshToken),
      String(usuario.id),
      this.refreshTtlSegundos,
    );

    const respuesta = new AuthResponseDto();
    respuesta.accessToken = accessToken;
    respuesta.refreshToken = refreshToken;
    respuesta.tokenType = 'Bearer';
    respuesta.expiresIn = this.tokenService.segundosDeVida();
    respuesta.usuario = UsuarioResponseDto.from(usuario);

    return respuesta;
  }

  private intentosRestantes(cantidad: number): string {
    return cantidad === 1 ? 'Le queda 1 intento' : `Le quedan ${cantidad} intentos`;
  }

  private enMinutos(cantidad: number): string {
    return cantidad === 1 ? '1 minuto' : `${cantidad} minutos`;
  }
}
