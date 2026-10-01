/**
 * Equivalente al application.yml de Spring Boot.
 *
 * En Nest no hay un yml magico: se define una funcion que lee process.env y
 * devuelve un objeto tipado. Ese objeto queda accesible via ConfigService
 * con notacion de puntos: configService.get('jwt.secret').
 */
export default () => ({
  app: {
    env: process.env.NODE_ENV ?? 'development',
    port: parseInt(process.env.PORT ?? '3000', 10),
    apiPrefix: process.env.API_PREFIX ?? 'api',
    swaggerEnabled: process.env.SWAGGER_ENABLED !== 'false',
  },

  database: {
    // Prisma se configura con una unica cadena de conexion.
    url: process.env.DATABASE_URL ?? '',
    logging: process.env.DB_LOGGING === 'true',
  },

  redis: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    // Redis trae 16 bases numeradas (0-15) aisladas entre si. Se usa la 0 para
    // desarrollo y la 1 para los tests, asi la suite puede hacer FLUSHDB sin
    // borrarte las sesiones abiertas mientras trabajas.
    db: parseInt(process.env.REDIS_DB ?? '0', 10),
  },

  jwt: {
    secret: process.env.JWT_SECRET ?? '',
    expiration: process.env.JWT_EXPIRATION ?? '15m',
    refreshExpirationDays: parseInt(process.env.JWT_REFRESH_EXPIRATION_DAYS ?? '7', 10),
    bcryptSaltRounds: parseInt(process.env.BCRYPT_SALT_ROUNDS ?? '10', 10),
  },

  cors: {
    allowedOrigins: (process.env.CORS_ALLOWED_ORIGINS ?? 'http://localhost:5173')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  },

  throttle: {
    // Se apaga en los tests e2e: el limite del login es de 3 intentos cada
    // 10 segundos y una suite hace muchos mas, con lo cual los tests
    // empezarian a fallar por orden de ejecucion en vez de por su logica.
    // El throttler se prueba aparte, en su propio spec, que lo prende.
    enabled: process.env.THROTTLE_ENABLED !== 'false',
  },

  rateLimit: {
    maxLoginAttempts: parseInt(process.env.MAX_LOGIN_ATTEMPTS ?? '5', 10),
    attemptsWindowMinutes: parseInt(process.env.LOGIN_ATTEMPTS_WINDOW_MIN ?? '5', 10),
    blockDurationMinutes: parseInt(process.env.LOGIN_BLOCK_DURATION_MIN ?? '30', 10),
  },

  bonita: {
    // Apagado salvo que se prenda explicitamente: los tests e2e y quien
    // levante la API sin el motor no tienen por que depender de el.
    enabled: process.env.BONITA_ENABLED === 'true',
    // Raiz de la webapp, sin barra final: http://localhost:8080/bonita
    url: (process.env.BONITA_URL ?? 'http://localhost:8080/bonita').replace(/\/+$/, ''),
    // Un usuario de Bonita por actor del proceso: cada tarea la ejecuta el
    // usuario mapeado al actor de su lane.
    // 'admin' se usa para consultas tecnicas de catalogo y tareas.
    usuarios: {
      admin: {
        username: process.env.BONITA_ADMIN_USERNAME || 'admin',
        password: process.env.BONITA_ADMIN_PASSWORD || 'bpm',
      },
      municipio: {
        username: process.env.BONITA_MUNICIPIO_USERNAME ?? '',
        password: process.env.BONITA_MUNICIPIO_PASSWORD ?? '',
      },
      coordinador: {
        username: process.env.BONITA_COORDINADOR_USERNAME ?? '',
        password: process.env.BONITA_COORDINADOR_PASSWORD ?? '',
      },
      ong: {
        username: process.env.BONITA_ONG_USERNAME ?? '',
        password: process.env.BONITA_ONG_PASSWORD ?? '',
      },
    },
    processName: process.env.BONITA_PROCESS_NAME ?? 'RescueSync',
    // Vacio = la ultima version habilitada.
    processVersion: process.env.BONITA_PROCESS_VERSION || undefined,
    timeoutMs: parseInt(process.env.BONITA_TIMEOUT_MS ?? '10000', 10),
    // Token fijo con el que Bonita se autentica contra esta API cuando la
    // llama desde un conector (header X-Service-Token). Vacio = deshabilitado.
    callbackToken: process.env.BONITA_CALLBACK_TOKEN ?? '',
  },
});
