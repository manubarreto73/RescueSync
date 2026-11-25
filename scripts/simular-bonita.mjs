/**
 * Hace lo que harian las tareas de servicio de Bonita, para probar el flujo
 * completo en una maquina sin el motor (BONITA_ENABLED=false).
 *
 * Son las mismas llamadas, en el mismo orden, que los conectores del diagrama:
 * a la API web con el header X-Service-Token, y al Sistema Nacional con la
 * cuenta de servicio de Bonita. No toca la base de datos.
 *
 * Uso, desde la carpeta del backend:
 *   node scripts/simular-bonita.mjs cerrar <emergenciaId>       nodos 4 a 7 (y 9 si cubre)
 *   node scripts/simular-bonita.mjs validar <emergenciaId>      nodo 9
 *   node scripts/simular-bonita.mjs comprometer <emergenciaId>  nodo 11 (paso 6)
 *   node scripts/simular-bonita.mjs liberar <emergenciaId>      nodo 13 (paso 7)
 *
 * Con Bonita, :ref es el id del caso. Aca no hay caso, asi que se usa
 * "local-<emergenciaId>": lo importante es que comprometer y liberar usen la
 * misma referencia.
 */
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
);

const API = `http://localhost:${env.PORT ?? 3000}/api/v1`;
const NACIONAL = env.SISTEMA_NACIONAL_URL ?? 'http://localhost:3001/api/v1';
const TOKEN = env.BONITA_CALLBACK_TOKEN;
const BONITA_EMAIL = process.env.BONITA_SN_EMAIL ?? 'bonita@rescuesync.ar';
const BONITA_PASSWORD = process.env.BONITA_SN_PASSWORD ?? 'Bonita2026!';

const [accion, idTexto] = process.argv.slice(2);
const id = Number(idTexto);

if (!TOKEN) salir('Falta BONITA_CALLBACK_TOKEN en el .env del backend.');
if (!['cerrar', 'validar', 'comprometer', 'liberar'].includes(accion) || !id) {
  salir('Uso: node scripts/simular-bonita.mjs <cerrar|validar|comprometer|liberar> <emergenciaId>');
}

const ref = `local-${id}`;

function salir(mensaje) {
  console.error(mensaje);
  process.exit(1);
}

function paso(texto) {
  console.log(`\n> ${texto}`);
}

async function llamar(metodo, url, { headers = {}, body } = {}) {
  const res = await fetch(url, {
    method: metodo,
    headers: { ...headers, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const datos = await res.json().catch(() => ({}));
  console.log(`  ${metodo} ${url.replace(/^https?:\/\/[^/]+/, '')} -> ${res.status}`);
  return { status: res.status, datos };
}

const app = (metodo, ruta, body) =>
  llamar(metodo, `${API}/emergencias/${id}${ruta}`, { headers: { 'X-Service-Token': TOKEN }, body });

async function loginNacional() {
  const { status, datos } = await llamar('POST', `${NACIONAL}/auth/login`, {
    body: { email: BONITA_EMAIL, password: BONITA_PASSWORD },
  });
  if (status !== 200 && status !== 201) salir(`  El Sistema Nacional rechazo el login: ${JSON.stringify(datos)}`);
  return { Authorization: `Bearer ${datos.accessToken}` };
}

function exigir({ status, datos }, ...esperados) {
  if (!esperados.includes(status)) salir(`  Respuesta inesperada: ${JSON.stringify(datos, null, 2)}`);
  return datos;
}

async function validar() {
  paso('Nodo 9 · Validar ofertas: consolidado -> Sistema Nacional -> resultado a la app');
  const consolidado = exigir(await app('GET', '/ofertas/consolidado'), 200);
  const lineas = consolidado.ofertas.flatMap((o) => o.lineas);
  if (lineas.length === 0) return console.log('  No hay ofertas presentadas para validar.');

  const auth = await loginNacional();
  const resultado = exigir(
    await llamar('POST', `${NACIONAL}/validaciones`, {
      headers: auth,
      body: {
        gravedad: consolidado.gravedad,
        lineas: lineas.map(({ lineaId, codigoNacional, categoria, cantidad }) => ({
          lineaId,
          codigoNacional,
          categoria,
          cantidad,
        })),
      },
    }),
    200,
    201,
  );
  for (const r of resultado.resultados) {
    console.log(`    linea ${r.lineaId}: ${r.caracter} · ${r.perfilCompetencia}`);
  }
  exigir(await app('POST', '/ofertas/validar', resultado), 200, 201);
  console.log('  Listo: el municipio ya puede adjudicar.');
}

if (accion === 'cerrar') {
  paso('Nodo 4 · Vence el timer: cerrar la convocatoria');
  exigir(await app('POST', '/cerrar-convocatoria'), 200, 201);

  paso('Nodo 5 · Leer cobertura');
  const cobertura = exigir(await app('GET', '/lotes/cobertura'), 200);
  for (const l of cobertura.lotes) {
    console.log(
      `    ${l.descripcion}: ${l.cantidadOfertada}/${l.cantidadRequerida} ${l.unidad}${l.cubierto ? '' : `  (faltan ${l.faltante})`}`,
    );
  }

  if (cobertura.cubierta) {
    paso('Nodo 6 -> 7 · Cobertura completa: habilitar la adjudicacion');
    exigir(await app('POST', '/habilitar-adjudicacion'), 200, 201);
    await validar();
  } else {
    paso('Nodo 6 -> 8 · Cobertura incompleta: decide el Coordinador en la web');
    console.log('  - Reabrir o reformular y reabrir: despues volver a correr "cerrar".');
    console.log('  - Continuar con cobertura parcial: despues correr "validar".');
  }
} else if (accion === 'validar') {
  await validar();
} else if (accion === 'comprometer') {
  paso('Nodo 11 · Comprometer recursos (paso 6)');
  const compromisos = exigir(await app('GET', '/ofertas/compromisos'), 200);
  for (const c of compromisos.compromisos) {
    console.log(`    ${c.codigoNacional}: ${c.items.map((i) => `${i.cantidad} ${i.categoria}`).join(', ')}`);
  }
  const auth = await loginNacional();
  const res = await llamar('POST', `${NACIONAL}/proyectos/${ref}/compromisos`, {
    headers: auth,
    body: compromisos,
  });
  if (res.status === 409) {
    console.log('  409: no alcanza el stock y no se comprometio nada.');
    console.log(JSON.stringify(res.datos, null, 2));
  } else {
    exigir(res, 200, 201);
    console.log(`  Recursos comprometidos en el proyecto ${ref}.`);
  }
} else if (accion === 'liberar') {
  paso('Nodo 13 · Liberar recursos (paso 7)');
  const auth = await loginNacional();
  const datos = exigir(
    await llamar('POST', `${NACIONAL}/proyectos/${ref}/cerrar`, { headers: auth }),
    200,
    201,
  );
  console.log(`  Proyecto ${ref} cerrado. Respuesta del Sistema Nacional:`);
  console.log(JSON.stringify(datos, null, 2));
}
