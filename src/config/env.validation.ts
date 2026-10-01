import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  MinLength,
  ValidateIf,
  validateSync,
} from 'class-validator';

export enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

/**
 * Validacion de variables de entorno al arrancar (fail fast).
 *
 * Spring Boot falla al levantar si falta una property obligatoria; aca se
 * reproduce ese comportamiento: si falta DATABASE_URL o JWT_SECRET, la app no
 * arranca en vez de romper recien en el primer request.
 */
class EnvironmentVariables {
  @IsEnum(Environment)
  @IsOptional()
  NODE_ENV?: Environment;

  @IsNumber()
  @IsOptional()
  PORT?: number;

  @IsUrl(
    { protocols: ['postgresql', 'postgres'], require_tld: false },
    { message: 'DATABASE_URL debe ser una cadena postgresql://usuario:pass@host:puerto/base' },
  )
  DATABASE_URL!: string;

  @IsString()
  REDIS_HOST!: string;

  @IsNumber()
  REDIS_PORT!: number;

  @IsString()
  @MinLength(32, { message: 'JWT_SECRET debe tener al menos 32 caracteres' })
  JWT_SECRET!: string;

  // Solo se exigen con la integracion prendida: sin motor no hacen falta.
  @ValidateIf((env: EnvironmentVariables) => env.BONITA_ENABLED === 'true')
  @IsUrl(
    { protocols: ['http', 'https'], require_tld: false },
    {
      message: 'BONITA_URL debe ser la raiz de la webapp, por ejemplo http://localhost:8080/bonita',
    },
  )
  BONITA_URL?: string;

  @IsOptional()
  @IsIn(['true', 'false'])
  BONITA_ENABLED?: string;

  @IsOptional()
  BONITA_ADMIN_USERNAME?: string;

  @IsOptional()
  BONITA_ADMIN_PASSWORD?: string;

  @ValidateIf((env: EnvironmentVariables) => env.BONITA_ENABLED === 'true')
  @IsNotEmpty({ message: 'BONITA_MUNICIPIO_USERNAME es obligatorio con BONITA_ENABLED=true' })
  BONITA_MUNICIPIO_USERNAME?: string;

  @ValidateIf((env: EnvironmentVariables) => env.BONITA_ENABLED === 'true')
  @IsNotEmpty({ message: 'BONITA_MUNICIPIO_PASSWORD es obligatorio con BONITA_ENABLED=true' })
  BONITA_MUNICIPIO_PASSWORD?: string;

  @ValidateIf((env: EnvironmentVariables) => env.BONITA_ENABLED === 'true')
  @IsNotEmpty({ message: 'BONITA_COORDINADOR_USERNAME es obligatorio con BONITA_ENABLED=true' })
  BONITA_COORDINADOR_USERNAME?: string;

  @ValidateIf((env: EnvironmentVariables) => env.BONITA_ENABLED === 'true')
  @IsNotEmpty({ message: 'BONITA_COORDINADOR_PASSWORD es obligatorio con BONITA_ENABLED=true' })
  BONITA_COORDINADOR_PASSWORD?: string;

  @ValidateIf((env: EnvironmentVariables) => env.BONITA_ENABLED === 'true')
  @IsNotEmpty({ message: 'BONITA_ONG_USERNAME es obligatorio con BONITA_ENABLED=true' })
  BONITA_ONG_USERNAME?: string;

  @ValidateIf((env: EnvironmentVariables) => env.BONITA_ENABLED === 'true')
  @IsNotEmpty({ message: 'BONITA_ONG_PASSWORD es obligatorio con BONITA_ENABLED=true' })
  BONITA_ONG_PASSWORD?: string;

  // Si esta, tiene que ser largo: es una credencial con permisos de coordinador.
  @ValidateIf((env: EnvironmentVariables) => !!env.BONITA_CALLBACK_TOKEN)
  @MinLength(32, { message: 'BONITA_CALLBACK_TOKEN debe tener al menos 32 caracteres' })
  BONITA_CALLBACK_TOKEN?: string;
}

export function validateEnv(config: Record<string, unknown>) {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validated, { skipMissingProperties: false });

  if (errors.length > 0) {
    const detalle = errors
      .map((e) => `  - ${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`)
      .join('\n');
    throw new Error(`Configuracion invalida en el archivo .env:\n${detalle}`);
  }

  return config;
}
