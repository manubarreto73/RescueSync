/**
 * Aplica las migraciones sobre la base de tests.
 *
 * Existe porque `DATABASE_URL=... prisma migrate deploy` no funciona igual en
 * PowerShell que en bash, y agregar cross-env o dotenv-cli solo para esto es
 * una dependencia de mas. Este script carga .env.test y lanza el CLI de
 * Prisma con ese entorno, igual en Windows que en Linux.
 */
const { spawnSync } = require('node:child_process');
const { config } = require('dotenv');

const { parsed, error } = config({ path: '.env.test' });

if (error || !parsed?.DATABASE_URL) {
  console.error('No se pudo leer DATABASE_URL de .env.test');
  process.exit(1);
}

console.log(`Migrando la base de tests: ${parsed.DATABASE_URL.replace(/:[^:@]+@/, ':***@')}`);

const resultado = spawnSync('npx', ['prisma', 'migrate', 'deploy'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, ...parsed },
});

process.exit(resultado.status ?? 1);
