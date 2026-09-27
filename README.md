# RescueSync API

Backend de la aplicacion web de **RescueSync** — Trabajo Practico Integrador, Desarrollo de
Software en Sistemas Distribuidos, curso 2026.

Es uno de los cuatro componentes del sistema:

| Componente | Rol |
|---|---|
| **Esta API (NestJS)** | Backend de la app web. Persiste emergencias, lotes y ofertas en Postgres. Expone a Bonita el listado consolidado de ofertas. |
| Front web | Interfaces por rol (municipio, coordinador, ONG, auditor). |
| Bonita BPM | Orquesta el ciclo de vida de la emergencia, el timer de la convocatoria y las llamadas HTTP. |
| Sistema Nacional (API cloud) | Servicio externo con JWT: valida competencias, bloquea y libera recursos. |

---

## Stack

| Capa | Tecnologia | Equivalente en Spring Boot |
|---|---|---|
| Runtime | Node.js 24 | JVM |
| Framework | NestJS 11 | Spring Boot |
| Acceso a datos | Prisma 6 | Hibernate + Spring Data JPA |
| Migraciones | Prisma Migrate | Flyway |
| Seguridad | Passport JWT + guards | Spring Security |
| Validacion | class-validator | Bean Validation |
| Documentacion | Swagger (@nestjs/swagger) | springdoc-openapi |
| Cache / sesiones | Redis (ioredis) | Spring Data Redis |
| Rate limiting | @nestjs/throttler + storage Redis | Bucket4j |
| Base de datos | PostgreSQL 16 | PostgreSQL |

---

## Como correrlo

Setup elegido: **Docker Engine nativo dentro de WSL2 (Ubuntu), sin Docker Desktop, con
el proyecto en el filesystem de Windows.**

Funciona porque WSL2 monta los discos de Windows en `/mnt/c`, asi que el demonio de
Docker (que corre en Linux) puede leer el proyecto y montarlo dentro de los
contenedores. La regla practica que hay que recordar:

> **Los comandos `docker` se ejecutan desde una terminal de Ubuntu, no desde PowerShell.**
> Sin Docker Desktop no existe cliente de Docker del lado de Windows.

Editas en VS Code sobre Windows como siempre; solo las operaciones de Docker pasan por
la terminal de Ubuntu. Para no andar cambiando de ventana, en VS Code podes abrir una
terminal Ubuntu con `Ctrl+Shift+ñ` y eligiendo el perfil **Ubuntu (WSL)**.

---

### 1. Instalar Docker Engine en Ubuntu

Desde una terminal de Ubuntu:

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
```

Cerrar y volver a abrir la terminal para que tome el grupo `docker`.

**Que el demonio arranque solo.** WSL2 no levanta servicios por defecto salvo que se
habilite systemd. Editar `/etc/wsl.conf`:

```bash
sudo tee /etc/wsl.conf > /dev/null <<'EOF'
[boot]
systemd=true
EOF
```

Despues, desde **PowerShell**, reiniciar la distro:

```powershell
wsl --shutdown
```

Al volver a abrir Ubuntu:

```bash
sudo systemctl enable --now docker
docker run --rm hello-world
```

Si preferis no habilitar systemd, el demonio se arranca a mano en cada sesion con
`sudo service docker start`.

<details>
<summary>Si <code>hello-world</code> falla con un error de iptables</summary>

Es el problema mas comun de Docker en WSL2: Ubuntu usa `nftables` y el demonio espera
`iptables`. Se resuelve cambiando la alternativa:

```bash
sudo update-alternatives --set iptables /usr/sbin/iptables-legacy
sudo service docker restart
```

</details>

---

### 2. Configuracion inicial (una sola vez)

```bash
cp .env.example .env

# generar un secreto real para JWT_SECRET y pegarlo en el .env
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
```

---

### 3. Elegir como levantarlo

Dos modos, los dos con el codigo en Windows y Docker en WSL.

#### Modo A: solo las bases en Docker (recomendado para el dia a dia)

Postgres y Redis en contenedores; la API corre nativa en Windows. Es lo mas agil: el
hot-reload es instantaneo porque Node vigila archivos locales, sin cruzar ningun puente.

Terminal de **Ubuntu**, parada en la carpeta del proyecto:

```bash
cd "/mnt/c/Users/Administrator/Desktop/Sistemas distribuidos/Trabajo Integrador"
docker compose up -d postgres redis
```

Terminal de **Windows** (PowerShell o la de VS Code):

```powershell
npm run migrate:deploy
npm run db:seed
npm run start:dev
```

Los puertos publicados por Docker en WSL2 se reenvian solos a `localhost` de Windows,
asi que la app y Postman llegan a Postgres y Redis sin configurar nada.

#### Modo B: todo en Docker

Incluye el contenedor de la API. Es el que hay que probar antes de entregar, porque es
el que valida el `Dockerfile`.

Terminal de **Ubuntu**:

```bash
cd "/mnt/c/Users/Administrator/Desktop/Sistemas distribuidos/Trabajo Integrador"
docker compose up --build
docker compose exec api npm run db:seed    # en otra terminal
```

El contenedor aplica las migraciones pendientes y despues arranca la app.

El hot-reload tambien anda en este modo, pero por **polling**: los eventos inotify no
cruzan el puente entre el filesystem de Windows y el de Linux, asi que el watcher por
defecto nunca se enteraria de que guardaste. Por eso el contenedor arranca con
`-p tsconfig.docker.json`, que activa `dynamicPriorityPolling`. Cuesta algo de CPU y
reacciona con ~1 segundo de retraso.

> Solo se montan `./src` y `./prisma`. Si tocas `package.json`, un `tsconfig*.json` o el
> `Dockerfile`, hay que rehacer la imagen: `docker compose up --build`.

---

### Puertos: esta maquina usa 5433 y 6381

Los puertos por defecto estaban ocupados, asi que los contenedores del TP publican otros:

| Servicio | Puerto del TP | Que ocupaba el habitual |
|---|---|---|
| PostgreSQL | **5433** | PostgreSQL 18 instalado como servicio de Windows, en el 5432 |
| Redis | **6381** | `redis-server` nativo de Ubuntu (systemd) en el 6379, y otro proyecto en el 6380 |

Se eligio correr al lado en vez de apagar esos servicios, que pueden estar en uso por
otros proyectos. Esto solo afecta a los puertos publicados hacia afuera: dentro de la red
de Docker la API le sigue hablando a `postgres:5432` y `redis:6379`.

Si te conectas con un cliente grafico o por consola, la base del TP es la del **5433**:

```bash
psql -h localhost -p 5433 -U rescuesync -d rescuesync
docker exec -it rescuesync-redis redis-cli
```

---

### WSL se apaga solo y se lleva los contenedores

WSL2 termina la VM cuando queda ociosa. Cuando eso pasa, el demonio de Docker se va con
ella y los contenedores quedan caidos, aunque vuelvan a levantarse la proxima vez que
corras un comando de docker.

El sintoma tipico es que la app venia andando y de golpe:

```
Can't reach database server at `localhost:5433`
```

**Solucion practica: dejar una terminal de Ubuntu abierta** mientras trabajas. Con eso la
VM no se apaga. Si preferis que no se apague nunca, se configura en el archivo
`.wslconfig` de tu carpeta de usuario de Windows:

```ini
[experimental]
vmIdleTimeout=-1
```

Despues de editarlo hay que hacer `wsl --shutdown` desde PowerShell para que tome efecto.
Es un cambio global de WSL, no solo de este proyecto.

---

### Si algun dia la lentitud molesta

Todo lo que pase por `/mnt/c` cruza el puente 9p y es varias veces mas lento que el
filesystem nativo de Linux. Se nota sobre todo en `docker compose build` y en
`npm install`. Si llega a molestar, la salida es mover el proyecto a `~/proyectos/`
dentro de Ubuntu (ahi inotify funciona de verdad y no hace falta el polling), pero no
es necesario para trabajar.

### URLs

- API: http://localhost:3000/api/v1
- Swagger: http://localhost:3000/api/docs
- Health: http://localhost:3000/api/v1/health
- Prisma Studio (GUI de la base): `npx prisma studio`, en http://localhost:5555

---

## Comandos

| Comando | Que hace |
|---|---|
| `npm run start:dev` | Arranca con hot-reload |
| `npm run build` | Compila TypeScript a `dist/` |
| `npm run lint` | ESLint + Prettier con autofix |
| `npm test` | Tests unitarios (Jest) |
| `npm run migrate:dev -- --name alta_usuarios` | Crea y aplica una migracion a partir de los cambios del schema |
| `npm run migrate:deploy` | Aplica migraciones pendientes (produccion, CI, arranque del contenedor) |
| `npm run migrate:status` | Muestra aplicadas y pendientes |
| `npm run migrate:reset` | Borra la base, reaplica todo y corre el seed |
| `npm run prisma:generate` | Regenera el cliente tipado tras tocar el schema |
| `npm run prisma:studio` | GUI web para inspeccionar y editar datos |
| `npm run db:seed` | Carga los datos iniciales |

Dentro de Docker, anteponer `docker compose exec api`.

> Despues de editar cualquier archivo `.prisma` hay que correr `prisma generate`, si no
> TypeScript sigue viendo los tipos viejos. `migrate:dev` lo hace automaticamente.

---

## Endpoints implementados

### Auth (`/api/v1/auth`)

| Metodo | Ruta | Acceso | Que hace |
|---|---|---|---|
| POST | `/login` | publico | Devuelve accessToken (JWT, 15 min) + refreshToken (opaco, 7 dias) |
| POST | `/refresh` | publico | Canjea el refresh token por un par nuevo. De un solo uso |
| POST | `/logout` | autenticado | Manda el access token a la blacklist y borra el refresh |
| GET | `/me` | autenticado | Datos del usuario del token |

### Lotes (`/api/v1/emergencias/:emergenciaId/lotes`)

Los "Lotes de Necesidades" del eslabon 2: una necesidad concreta y cuantificada, del
estilo "5 paramedicos" o "1000 raciones". Es la unidad sobre la que ofertan las ONGs.

| Metodo | Ruta | Rol requerido |
|---|---|---|
| GET | `/` | quien pueda ver la emergencia |
| POST | `/` | CENTRO_COORDINADOR |
| PUT | `/:id` | CENTRO_COORDINADOR |
| DELETE | `/:id` | CENTRO_COORDINADOR |

Ruta anidada porque un lote no tiene sentido fuera de su emergencia. El control de acceso
se **delega** en ella: si el usuario no puede ver la emergencia, tampoco sus lotes, y la
regla vive en un solo lugar.

Solo se pueden tocar con la emergencia en `REGISTRADA` (desglose inicial) o
`CONVOCATORIA_CERRADA` (la "reformulacion de lotes" que pide la consigna tras el vencimiento
del temporizador). Con la convocatoria **abierta** no: las ONGs estan ofertando sobre ellos
en ese preciso momento, y cambiar una cantidad debajo de una oferta en curso la invalidaria
sin que nadie se entere.

La **cobertura** (`cantidadCubierta`, `porcentajeCobertura`, `cubierto`) se calcula al leer
con un `GROUP BY ... SUM()` sobre las lineas de las ofertas adjudicadas. Un contador
denormalizado se desincronizaria en cuanto alguien retire una oferta, y un numero de
cobertura equivocado hace que el Coordinador decida mal.

### Ofertas (`/api/v1/ofertas`)

| Metodo | Ruta | Rol requerido |
|---|---|---|
| POST | `/` | REPRESENTANTE_ONG |
| GET | `/` | los cuatro perfiles, con alcance distinto |
| GET | `/:id` | idem |
| GET | `/:id/versiones` | idem — trazabilidad de ediciones |
| PUT | `/:id` | ONG lider, dentro de la ventana |
| POST | `/:id/presentar` | ONG lider |
| POST | `/:id/retirar` | ONG lider, dentro de la ventana |
| POST | `/:id/adjudicar` | OPERADOR_MUNICIPAL duenio |
| POST | `/:id/rechazar` | OPERADOR_MUNICIPAL duenio |
| POST | `/:id/finalizar-participacion` | cada ONG del consorcio |

Y los dos que consume Bonita, que cuelgan de la emergencia:

| Metodo | Ruta | Rol requerido |
|---|---|---|
| GET | `/emergencias/:id/ofertas/consolidado` | CENTRO_COORDINADOR, AUDITOR |
| POST | `/emergencias/:id/ofertas/validar` | CENTRO_COORDINADOR |

### Consorcios y ofertas parciales

Una oferta **no pertenece a una organizacion, sino a un conjunto**. Tres tablas:

```
Oferta ──< OfertaParticipante >── Organizacion     quien integra el consorcio
   │                                               (y si ya finalizo su parte)
   └──< OfertaLinea ──> Lote                       que aporta cada quien, a que lote
                   └──> Organizacion
```

- **Oferta parcial**: `OfertaLinea.cantidad` puede ser menor a lo que pide el lote.
- **Oferta conjunta**: varias lineas de varias organizaciones sobre el mismo lote. Entre
  las dos ONGs cubren los 5 paramedicos que ninguna podia sola.
- `esConsorcio` sale calculado de la cantidad de participantes, y es lo que permite el
  indicador de "porcentaje de resolucion mediante consorcios" que pide el tablero.

`OfertaParticipante` existe como tabla propia y no se deduce de las lineas porque el cierre
del eslabon 7 se marca **por ONG** ("las ONGs marcan sus actividades como finalizadas", en
plural), y la oferta pasa a `FINALIZADA` recien cuando lo hicieron todas.

### Versionado de ofertas

Cada edicion dentro de la ventana incrementa `version` y deja el detalle anterior en
`OfertaVersion` como JSON. Es la trazabilidad que pide la consigna: sin ella, una ONG podria
bajar su ofrecimiento sobre el cierre y nadie tendria como demostrar que antes ofrecia otra
cosa.

### Validacion externa: sin rechazo binario

La consigna es explicita en que el Sistema Nacional *"no aplicara un rechazo punitivo o
binario, sino que retornara perfiles de competencia"*. Por eso `POST .../ofertas/validar` no
recibe un `aprobada: true/false`, sino un `caracter` por linea:

| Caracter | Significado |
|---|---|
| `PRINCIPAL` | la ONG tiene la habilitacion plena para ese lote |
| `APOYO_SECUNDARIO` | tiene menor nivel, pero entra igual como apoyo |

### Ciclo de vida de la oferta

```
BORRADOR ──presentar──► PRESENTADA ──validar──► VALIDADA ──adjudicar──► ADJUDICADA
    │                        │                      │                        │
    └────retirar─────────────┴──► RETIRADA          └──rechazar──► NO_ADJUDICADA
                                                                             │
                              FINALIZADA ◄──── todas las ONGs finalizaron ───┘
```

### Alcance por filas de las ofertas

Es la regla mas delicada del sistema:

| Perfil | Que ofertas ve |
|---|---|
| REPRESENTANTE_ONG | **solo aquellas en las que participa** |
| OPERADOR_MUNICIPAL | solo las de sus emergencias, y **solo desde que estan validadas** |
| CENTRO_COORDINADOR / AUDITOR | todas |

Si una ONG viera las ofertas de las demas durante la ventana, podria mirar lo que oferto la
competencia antes de cerrar la suya. Eso rompe el proceso entero, no solo la privacidad.

### Emergencias (`/api/v1/emergencias`)

La raiz del proceso. Su `estado` es el reflejo local del avance de la instancia en Bonita.

| Metodo | Ruta | Rol requerido |
|---|---|---|
| POST | `/` | OPERADOR_MUNICIPAL |
| GET | `/` | los cuatro perfiles, con alcance distinto |
| GET | `/:id` | los cuatro perfiles, con alcance distinto |
| PUT | `/:id` | OPERADOR_MUNICIPAL duenio, solo en REGISTRADA |
| POST | `/:id/publicar-convocatoria` | CENTRO_COORDINADOR |
| POST | `/:id/cerrar-convocatoria` | CENTRO_COORDINADOR (y Bonita al vencer el timer) |
| POST | `/:id/reabrir-convocatoria` | CENTRO_COORDINADOR |
| POST | `/:id/habilitar-adjudicacion` | CENTRO_COORDINADOR |
| POST | `/:id/adjudicar` | OPERADOR_MUNICIPAL duenio |
| POST | `/:id/finalizar` | CENTRO_COORDINADOR |
| POST | `/:id/cancelar` | OPERADOR_MUNICIPAL duenio o CENTRO_COORDINADOR |

Las transiciones son endpoints con nombre de negocio y no un `PATCH { estado: "X" }`.
Cada una tiene precondiciones, permisos y datos propios: publicar exige una fecha de
cierre, cancelar exige un motivo, adjudicar solo lo puede hacer el municipio duenio. Un
PATCH generico obligaria a un switch gigante en el servicio y haria imposible expresar
los permisos con decoradores.

### Ciclo de vida de la emergencia

```
                    publicar-convocatoria          cerrar-convocatoria
  REGISTRADA ─────────────────────────► CONVOCATORIA_ABIERTA ─────────► CONVOCATORIA_CERRADA
      │                                        ▲                             │       │
      │                                        └─────────────────────────────┘       │
      │                                              reabrir-convocatoria            │
      │                                                                              │
      │                                                        habilitar-adjudicacion│
      │                                                                              ▼
      │                 adjudicar                 finalizar                  EN_ADJUDICACION
      │       EN_EJECUCION ◄───────────────────────────────────────────────────────┘
      │             │
      │             └──────────► FINALIZADA
      │
      └──────────────────────────► CANCELADA  ◄── desde REGISTRADA, CONVOCATORIA_ABIERTA,
                                                  CONVOCATORIA_CERRADA o EN_ADJUDICACION
```

La tabla completa vive en [`emergencia-estados.ts`](src/dominio/emergencias/emergencia-estados.ts),
en un archivo propio y no desparramada en ifs: cuando alguien pregunte desde que estado
se puede cancelar, la respuesta esta en una tabla y no repartida en ocho metodos.

No se puede cancelar desde `EN_EJECUCION`: en ese punto ya hay recursos comprometidos en
el Sistema Nacional y gente movilizada. Abandonar un despliegue en curso no es cancelar.

### Alcance por filas

Es la capa del RBAC que no se resuelve con un decorador, porque no depende de que rol
tenes sino de a que filas tenes derecho.

| Perfil | Que emergencias ve |
|---|---|
| OPERADOR_MUNICIPAL | solo las de su municipio |
| REPRESENTANTE_ONG | solo las ya publicadas a la red (de CONVOCATORIA_ABIERTA en adelante) |
| CENTRO_COORDINADOR | todas |
| AUDITOR | todas |

El servicio arma una clausula de Prisma y el repositorio la combina con los filtros del
cliente usando **AND**: ningun query param puede ampliar el alcance.

Pedir una emergencia fuera de alcance devuelve **404, no 403**. Es deliberado: un 403
confirmaria que el recurso existe, y eso ya es informacion. Un municipio no tiene por que
enterarse de cuantas emergencias cargo el vecino probando ids.

### Organizaciones (`/api/v1/organizaciones`)

Municipios, ONGs, organismos de rescate, entes gubernamentales y el Centro Coordinador.
Es la entidad que permite acotar el acceso por pertenencia y el sujeto de los consorcios:
una oferta conjunta pertenece a varias organizaciones, nunca a un usuario.

| Metodo | Ruta | Rol requerido |
|---|---|---|
| POST | `/` | CENTRO_COORDINADOR |
| GET | `/` | CENTRO_COORDINADOR, AUDITOR, REPRESENTANTE_ONG |
| GET | `/mia` | cualquiera que pertenezca a una |
| PATCH | `/mia` | OPERADOR_MUNICIPAL, REPRESENTANTE_ONG (solo datos de contacto) |
| GET | `/:id` | CENTRO_COORDINADOR, AUDITOR, REPRESENTANTE_ONG |
| PUT | `/:id` | CENTRO_COORDINADOR |
| DELETE | `/:id` | CENTRO_COORDINADOR (bloqueada si tiene usuarios activos) |

El REPRESENTANTE_ONG puede listar porque la consigna pide que las ONGs se asocien en
consorcios "mediante la interfaz", y para eso tienen que poder encontrar a las otras.

### Pertenencia: que rol va con que tipo de organizacion

| Rol | Organizacion |
|---|---|
| OPERADOR_MUNICIPAL | obligatoria, de tipo MUNICIPIO |
| REPRESENTANTE_ONG | obligatoria, de tipo ONG u ORGANISMO_RESCATE |
| CENTRO_COORDINADOR | ninguna: es transversal a la red |
| AUDITOR | ninguna: es transversal a la red |

La regla vive en `UsuariosService`, no en el schema. Una foreign key sabe que la
organizacion existe, pero no que un REPRESENTANTE_ONG no puede colgar de un MUNICIPIO; si
se colara, ese usuario tendria permisos de ONG sobre los datos de un municipio.

El `organizacionId` viaja como claim del access token, para poder filtrar por pertenencia
sin consultar la base en cada request.

### Usuarios (`/api/v1/usuarios`)

Autogestion — cualquier usuario autenticado, siempre sobre su propia cuenta.
El id sale del token, nunca de la URL:

| Metodo | Ruta | Que hace |
|---|---|---|
| PATCH | `/me` | Edita nombre y telefono propios |
| PATCH | `/me/password` | Cambia la contrasena propia |
| DELETE | `/me` | Baja de la propia cuenta y cierre de sesiones |

Administracion — requiere perfil habilitado:

| Metodo | Ruta | Rol requerido |
|---|---|---|
| POST | `/` | CENTRO_COORDINADOR |
| GET | `/` | CENTRO_COORDINADOR, AUDITOR |
| GET | `/:id` | CENTRO_COORDINADOR, AUDITOR |
| PUT | `/:id` | CENTRO_COORDINADOR |
| DELETE | `/:id` | CENTRO_COORDINADOR (baja logica, sobre otros) |

> Las rutas `me` estan declaradas antes que las de `:id` en el controller.
> Nest resuelve por orden de declaracion: al reves, `:id` capturaria la palabra
> "me" como si fuera un id y el ParseIntPipe devolveria 400.

### Revocacion de sesiones

Un JWT no se puede apagar: una vez firmado es valido hasta que expira. Para que una baja
tenga efecto inmediato, `SessionRevocationService` lleva en Redis dos marcas que el
`JwtStrategy` consulta en cada request:

| Clave | Alcance | Cuando se escribe |
|---|---|---|
| `blacklist:<token>` | un token puntual | logout |
| `usuario_revocado:<id>` | todos los tokens de esa persona | baja, propia o administrativa |

Ambas con TTL igual a la vida del access token: pasado ese rato, cualquier token emitido
antes ya expiro por su cuenta y la marca no hace falta.

### Usuarios de prueba

`npm run db:seed` carga uno por cada perfil, todos con la contrasena `Rescue2026!`:

| Email | Rol | Organizacion |
|---|---|---|
| municipio@rescuesync.ar | OPERADOR_MUNICIPAL | Municipalidad de Villa Carlos Paz |
| coordinador@rescuesync.ar | CENTRO_COORDINADOR | — |
| ong@rescuesync.ar | REPRESENTANTE_ONG | Cruz Solidaria |
| bomberos@rescuesync.ar | REPRESENTANTE_ONG | Bomberos Voluntarios de Cosquin |
| auditor@rescuesync.ar | AUDITOR | — |

---

## Rate limiting

Hay dos mecanismos distintos, y conviene no confundirlos:

| | ThrottlerGuard | Bloqueo de IP |
|---|---|---|
| Que cuenta | Todos los requests | Solo los logins fallidos |
| Para que | Evitar sobrecarga y scraping | Evitar fuerza bruta de contrasenas |
| Limites | 5/seg, 30/10seg, 120/min (login: 3/10seg y 5/min) | 5 fallos, bloqueo de 30 min |
| Respuesta | 429 | 401 con los intentos restantes, y 429 una vez bloqueada |
| Donde vive | `common/throttler/` | `dominio/auth/services/login-attempts.service.ts` |

Los dos cuentan en Redis, no en la memoria del proceso: con el contador en memoria,
dos replicas de la API detras de un balanceador dejarian pasar el doble del limite.

Para destrabar una IP bloqueada durante las pruebas:

```bash
docker exec rescuesync-redis redis-cli --scan --pattern 'blocked_ip:*'
docker exec rescuesync-redis sh -c "redis-cli --scan --pattern 'blocked_ip:*' | xargs -r redis-cli DEL"
```

Y para resetear los contadores del throttler (las claves que empiezan con `{`):

```bash
docker exec rescuesync-redis sh -c "redis-cli --scan --pattern '{*' | xargs -r redis-cli DEL"
```

---

## Postman

La coleccion esta en `postman/RescueSync API.postman_collection.json`.

En Postman: **Import**, elegir el archivo, y queda una coleccion con los requests
agrupados en Auth, Usuarios e Infraestructura. El request **Login** guarda
automaticamente el `accessToken` y el `refreshToken` en variables de coleccion, asi que
el resto de los requests ya salen autenticados sin copiar y pegar nada.

Incluye casos de error a proposito: 401 por credenciales invalidas, 403 por RBAC
(un AUDITOR intentando crear un usuario) y 429 por rate limit.

---

## Estructura

```
prisma/
├── schema/                     # el schema, partido por dominio
│   ├── schema.prisma           # datasource + generator (no se toca seguido)
│   ├── enums.prisma            # Rol y demas enums compartidos
│   ├── organizacion.prisma     # Organizacion y TipoOrganizacion
│   ├── usuario.prisma          # Usuario
│   ├── emergencia.prisma       # Emergencia y su ciclo de vida
│   ├── lote.prisma             # Lote de Necesidades
│   └── oferta.prisma           # Oferta, participantes, lineas y versiones
├── migrations/                 # SQL versionado que genera Prisma Migrate
└── seed.ts                     # datos iniciales, idempotente

src/
├── main.ts                     # bootstrap: pipes, filtros, CORS, Swagger
├── app.module.ts               # modulo raiz: ensambla todo
│
├── config/                     # el "application.yml"
│   ├── configuration.ts        # env a objeto de config tipado
│   └── env.validation.ts       # falla al arrancar si falta una variable
│
├── prisma/                     # el "DataSource + EntityManager"
│   ├── prisma.service.ts       # cliente atado al ciclo de vida de Nest
│   ├── prisma.module.ts        # @Global: inyectable en toda la app
│   └── transaction.types.ts    # tipos para pasar la transaccion explicita
│
├── common/                     # transversal, sin logica de negocio
│   ├── exceptions/             # BusinessException, ResourceNotFoundException
│   ├── filters/                # AllExceptionsFilter (= @RestControllerAdvice)
│   ├── decorators/             # @Public, @Roles, @CurrentUser
│   ├── validators/             # @NoFutura, @Futura
│   ├── enums/                  # Rol (espejo del enum de Prisma)
│   ├── dtos/                   # PaginationQueryDto, PageResponse
│   └── throttler/              # rate limiting HTTP con storage en Redis
│
├── security/                   # el "SecurityConfig"
│   ├── security.module.ts      # registra JWT, Passport y los guards globales
│   ├── token.service.ts        # emision y verificacion de access tokens
│   ├── password.service.ts     # bcrypt
│   ├── strategies/jwt.strategy.ts
│   ├── guards/jwt-auth.guard.ts    # autenticacion (global)
│   └── guards/roles.guard.ts       # autorizacion por rol (global)
│
├── redis/                      # RedisService + catalogo de claves
├── health/                     # /health (= Actuator)
└── dominio/
    ├── organizaciones/         # municipios, ONGs, organismos de rescate
    ├── usuarios/               # ABM, autogestion y pertenencia
    ├── emergencias/            # alta, ciclo de vida y alcance por filas
    ├── lotes/                  # desglose de necesidades y cobertura
    ├── ofertas/                # consorcios, versionado e integracion con Bonita
    └── auth/                   # login, refresh, logout, bloqueo de IP
```

### Anatomia de un modulo de dominio

```
prisma/schema/emergencia.prisma           # el modelo vive en el schema, no en una clase

src/dominio/emergencias/
├── emergencias.module.ts
├── repositories/emergencia.repository.ts # unico lugar que toca PrismaService
├── services/emergencias.service.ts       # reglas de negocio + transacciones
├── controller/emergencias.controller.ts  # solo HTTP, sin logica
└── dtos/
    ├── request/
    │   ├── register-emergencia.dto.ts
    │   └── change-emergencia.dto.ts
    └── emergencia-response.dto.ts
```

Reglas que se mantienen del proyecto Java:

- El **controller** no tiene logica ni transacciones: valida, delega y devuelve.
- El **servicio** lanza `BusinessException` o `ResourceNotFoundException`, nunca `Error` pelado.
- El **repositorio** es el unico que conoce `PrismaService`. El servicio no arma queries.
- Los **modelos de Prisma** no salen nunca por HTTP: siempre se mapean a un `*ResponseDto`
  con una factory estatica `from(modelo)`.
- Los **DTOs de request** son la unica representacion de datos entrantes y llevan la
  validacion con decoradores.
- El **schema** lo define exclusivamente una migracion.

### Transacciones

Prisma no tiene `@Transactional`: la transaccion se pasa explicitamente.

```ts
await this.prisma.$transaction(async (tx) => {
  const emergencia = await this.emergenciaRepo.create(dto, tx);
  await this.loteRepo.createMany(lotes, emergencia.id, tx);
});
```

Por eso los metodos de repositorio reciben un `PrismaTransaction` opcional como ultimo
parametro y usan `tx ?? this.prisma`.

---

## Tests

268 tests e2e sobre auth, usuarios, organizaciones, emergencias, lotes y ofertas. "e2e" significa que entran por HTTP y salen por la
base: no hay mocks, se prueba la misma app que se despliega.

```bash
npm run test:e2e           # toda la suite
npm run test:e2e:watch     # reejecuta al guardar
npx jest --config ./test/jest-e2e.json --runInBand test/auth.e2e-spec.ts   # un archivo
```

Necesitan los contenedores levantados. La primera vez hay que crear la base de tests:

```bash
docker exec rescuesync-postgres psql -U rescuesync -d rescuesync \
  -c "CREATE DATABASE rescuesync_test OWNER rescuesync;"
npm run test:db:setup
```

De ahi en mas `pretest:e2e` aplica las migraciones pendientes solo.

### Aislamiento

Los tests nunca tocan los datos con los que estas trabajando:

| | Desarrollo | Tests |
|---|---|---|
| PostgreSQL | base `rescuesync` | base `rescuesync_test` |
| Redis | base 0 | base 1 |

`RedisService.flushDb()` se niega a correr sobre la base 0, asi que un `.env.test` mal
configurado falla en vez de borrarte las sesiones.

Cada test arranca del mismo estado: `beforeEach` trunca la tabla con `RESTART IDENTITY`,
vacia Redis y siembra 4 usuarios, uno por rol, con ids fijos 1 a 4. Un test que dependa
del id que salga, o de lo que dejo el test anterior, falla distinto cada vez que lo
corres.

### Estructura

```
test/
├── jest-e2e.json           # config propia: rootDir, testRegex, maxWorkers 1
├── setup-e2e.ts            # carga .env.test pisando el entorno
├── helpers/
│   ├── test-app.ts         # levanta la app Nest completa
│   ├── db.ts               # limpieza y siembra
│   └── auth.ts             # login por HTTP, devuelve tokens
├── auth.e2e-spec.ts            # login, refresh, logout, me, bloqueo de IP
├── usuarios.e2e-spec.ts        # ABM, RBAC, autogestion, pertenencia
├── organizaciones.e2e-spec.ts  # ABM, RBAC, unicidad, baja condicionada
├── emergencias.e2e-spec.ts     # alcance por filas, maquina de estados, transiciones
├── lotes.e2e-spec.ts           # desglose, estados editables, ruta anidada
├── ofertas.e2e-spec.ts         # consorcios, versionado, ciclo completo
└── throttler.e2e-spec.ts       # el unico con rate limiting encendido
```

`src/config/app-setup.ts` existe para esto: los tests levantan la app con la misma
configuracion que `main.ts` (ValidationPipe, filtro de errores, versionado, prefijo). Si
la configuraran distinto, estarian probando una app que no es la que se despliega.

### Dos cosas que conviene saber

**El rate limiting se apaga por configuracion, no con `overrideGuard`.** El
`ThrottlerGuard` esta registrado como `{ provide: APP_GUARD, useClass: ThrottlerGuard }`,
y Nest lo resuelve por el token `APP_GUARD`; un `overrideGuard(ThrottlerGuard)` compila
sin error y no surte ningun efecto. Se apaga con `THROTTLE_ENABLED`, que
`crearAppDeTest()` setea segun la suite.

**`BCRYPT_SALT_ROUNDS=4` en `.env.test`.** Con el cost 10 de produccion cada hash tarda
~100ms y la suite hace decenas de logins. Bajarlo no cambia el comportamiento, solo el
tiempo: la suite entera corre en ~40 segundos.

---

## Integracion con Bonita

Al vencer el timer de la convocatoria, Bonita hace un `GET` contra esta API para obtener
el listado consolidado de ofertas de una emergencia. Ese endpoint se implementa en el
modulo `ofertas` y se autentica con un token de servicio, no con sesion de usuario.
