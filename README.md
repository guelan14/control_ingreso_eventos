# Control de Ingreso a Eventos

Sistema web para registrar el ingreso de invitados a eventos presenciales, alertar cuando ingresa un
**premiado** y ver estadísticas en vivo. Maneja varios eventos con historial por edición (por ejemplo, el
aniversario de cada año) y también eventos simples sin rubros ni premiados. Proyecto de pasantía —
Misiones Online 2026.

**Autores:** Miguel Ángel Neumann · Dana Fleita

> Propuesta técnica y decisiones de diseño: [`docs/PROPUESTA.md`](docs/PROPUESTA.md)

## Stack

Next.js 16 (App Router) · TypeScript · PostgreSQL · Drizzle ORM · Zod · Tailwind CSS · Vitest + PGlite · ExcelJS · qrcode + jsQR · Docker

## Requisitos

- Node.js 24 o superior
- PostgreSQL 15 o superior, **o** Docker (`npm run db:up` levanta uno), **o** nada: ver PGlite abajo

## Instalación y uso local

```bash
npm install
cp .env.example .env.local
npm run db:up        # Postgres en Docker (opcional, ver abajo)
npm run db:migrate   # crea las tablas
npm run dev          # http://localhost:3000
```

**Sin Docker:** en `.env.local` usar `DATABASE_URL=pglite://./data/pglite`. Es un Postgres embebido
(PGlite) que guarda los datos en esa carpeta y aplica las migraciones solo. Sirve para desarrollar; en
producción se usa un Postgres real.

### Primer usuario

Todo el sistema pide login. El primer administrador se crea desde la terminal. Con PGlite hay que
frenar `npm run dev` antes; si está andando, el comando avisa y no hace nada (la carpeta de PGlite no
admite dos procesos a la vez y se bloquea con `data/pglite.lock`).

```bash
npm run usuario:crear -- --usuario admin --nombre "Nombre Apellido" --rol admin
```

Imprime una contraseña temporal que se cambia en el primer ingreso. El resto de los usuarios los crea
el administrador desde la pantalla **Usuarios**.

## Usuarios y roles

| Rol             | Puede                                                                 |
| --------------- | --------------------------------------------------------------------- |
| `admin`         | Todo, incluida la gestión de usuarios                                 |
| `organizador`   | Crear eventos y rubros, importar, dar de alta y editar invitados, ver el panel, generar QR y exportar a Excel |
| `recepcion`     | Ver eventos, buscar invitados, registrar ingresos (también por QR) y dar de alta en la puerta |

Los permisos están en un solo lugar: `src/lib/auth/roles.ts`.

- Contraseñas con hash scrypt; mínimo 10 caracteres. Las que asigna un administrador son temporales.
- Sesión de 12 horas guardada en la base (cookie `HttpOnly`, `SameSite=Lax`, `Secure` en producción).
  En la base se guarda solo el hash del token.
- 5 intentos fallidos bloquean la cuenta 15 minutos; un administrador puede restablecer la contraseña.
- Desactivar un usuario o restablecer su contraseña cierra sus sesiones al instante.
- Siempre queda al menos un administrador activo.
- La API rechaza pedidos que modifican datos si vienen de otro sitio (control de `Origin`).

## Variables de entorno

| Variable        | Ejemplo                                           | Descripción                          |
| --------------- | ------------------------------------------------- | ------------------------------------ |
| `DATABASE_URL`  | `postgres://eventos:eventos@localhost:5432/eventos` | Conexión a Postgres, o `pglite://<carpeta>` |
| `IMPORT_MAX_MB` | `5`                                               | Tamaño máximo del Excel a importar   |
| `COOKIE_SECURE` | `true`                                            | Cookie solo por HTTPS. Por defecto `true` en producción; `false` solo para la red local por `http://` |

## Importar datos de prueba

1. Abrir <http://localhost:3000>, ingresar con el administrador → **Nuevo evento** (los rubros sugeridos ya vienen cargados).
2. En el evento: **Importar invitados** → subir `ejemplos/invitados_demo.xlsx` (320 invitados ficticios)
   → **Validar archivo** → **Confirmar importación**.
3. Para ver el reporte de errores: `ejemplos/invitados_con_errores.xlsx`.
4. Para un evento sin rubros ni premiados (una charla): crear el evento destildando ambas opciones e
   importar `ejemplos/invitados_charla.xlsx`.

Cada evento tiene su plantilla, con sus columnas y sus rubros en listas desplegables: se descarga desde la
pantalla de importación. La plantilla general con 3 filas de ejemplo está en `public/plantilla_invitados.xlsx`.

### Formato del Excel

Hoja llamada **`Invitados`**, encabezados exactos en la fila 1:

| Columna           | Obligatoria                  | Valores                                     |
| ----------------- | ---------------------------- | ------------------------------------------- |
| `nombre_apellido` | Sí                           | Texto                                       |
| `empresa`         | Sí                           | Texto                                       |
| `confirmacion`    | Sí                           | `Confirmado` / `No Puede`                   |
| `rubro`           | Si el evento usa rubros      | Uno de los rubros del evento                |
| `premiado`        | Si el evento usa premiados   | `SI` / `NO` (mayúsculas)                    |
| `dni`             | No                           | Números o letras; se aceptan puntos         |
| `cargo`           | No                           | Texto                                       |
| `sector`          | No                           | Texto (ej. `A`, `Sector B`)                 |

Reglas:
- La importación es **todo o nada**: si hay un error no se graba nada y se muestra el reporte fila por fila.
- Reimportar actualiza al invitado existente: por **DNI** si lo tiene; si no, por **nombre + empresa** (sin
  distinguir mayúsculas ni tildes). No duplica y **nunca borra un check-in ya registrado**.
- Una celda opcional vacía o una columna opcional ausente **no borra** el dato que ya estaba.
- Homónimos (mismo nombre y empresa) se aceptan solo si ambos tienen DNI.
- Límites: 5 MB de archivo, 50 MB descomprimido, 5000 filas y 50 columnas.

## Check-in en puerta

En cada evento, **Check-in en puerta** (`/eventos/:id/checkin`), pensado para celular o tablet:

1. Se escribe nombre, apellido o empresa: la lista se filtra mientras se tipea.
2. Se toca al invitado: aparece su tarjeta (cargo, sector, rubro, si es premiado, si avisó que no venía).
3. **Registrar ingreso** graba la hora del servidor, quién lo registró y desde qué dispositivo.
4. Si es **premiado**, la pantalla entera se pone roja (y vibra el celular) hasta tocar "Entendido".
   Si no, muestra la confirmación y vuelve sola a la búsqueda.
5. Si ya había ingresado, avisa la hora anterior y no la cambia. Corregirla pide una confirmación
   explícita y queda registrada como corrección.

**Por QR:** el botón **QR** abre la cámara trasera; al leer el código aparece la tarjeta del invitado y
se sigue igual. Si el QR es de otro evento, lo avisa con el nombre del evento. La cámara solo funciona
por HTTPS (o en `localhost`); si no hay cámara o permiso, se busca por nombre.

**No está en la lista (D6):** al final de los resultados, **No está en la lista: dar de alta y registrar**
pide nombre, a quién acompaña (premiado, cargo o vínculo), y opcionalmente empresa y DNI. Crea al
invitado marcado como "sin lista" y registra su ingreso en el mismo paso. Si la persona ya estaba
cargada (mismo DNI, o mismo nombre y empresa), muestra su tarjeta en vez de duplicarla. En el panel
suma a los ingresados, pero no a confirmados ni a invitaciones enviadas (D7).

Sin red: el ingreso (o el alta) queda guardado en el dispositivo y se reenvía solo cada 5 segundos o al volver la
conexión. Cada toque lleva una clave única, así que un reintento nunca registra dos veces. Todos los
ingresos y correcciones quedan en la tabla `checkins`, que nunca se edita ni se borra.

## Gestión de invitados

En cada evento, **Lista de invitados** (`/eventos/:id/invitados`):

- Tabla paginada; quien ya ingresó aparece resaltado en verde con la hora.
- Filtros combinables: búsqueda, confirmación, sector, rubro, si ingresó y si es premiado.
- Cada nombre abre su ficha, con el historial de ingresos (quién los registró y cuándo).
- Organizadores y administradores pueden **editar** confirmación, sector, premiado, rubro y cargo (lo
  demás no se toca), y dar de **alta** un invitado a mano con validación.
- No se eliminan invitados (si hace falta, se reimporta el Excel) y la hora de ingreso no se edita:
  solo la registra el check-in.

## Panel en vivo

En cada evento, **Panel en vivo** (`/eventos/:id/panel`), para organizadores y administradores. Se
actualiza solo cada 15 segundos, tiene botón "Actualizar ahora", y si se corta la red sigue mostrando
los últimos datos con un aviso.

1. Ingresados (número grande), porcentaje sobre confirmados y sobre invitaciones enviadas, y cuántos
   confirmados faltan.
2. **Premiados que todavía no ingresaron**, en rojo. Cuando entraron todos, un mensaje verde. Aparte,
   los premiados que avisaron que no vienen.
3. Ingresos por rubro, con barra de progreso sobre los confirmados de cada rubro.
4. Los últimos 15 ingresos con nombre, empresa y hora exacta; los dados de alta en la puerta, marcados.
5. **Descargar presentes (Excel)**.

## Códigos QR y exportación

- **Códigos QR** (`/eventos/:id/qr`, organizadores): cada invitado de la lista tiene un código al azar
  de 16 caracteres. El QR lleva solo ese código, sin datos personales. Se descarga un **ZIP** con un PNG
  por invitado y `codigos.xlsx` (qué archivo es de quién, para combinar correspondencia por mail o
  WhatsApp), o se **imprimen tarjetas** (8 por hoja A4). La ficha de cada invitado muestra su QR.
- **Exportar a Excel** (organizadores, D11): desde el panel, los presentes en orden de llegada; desde la
  lista de invitados, todos con su estado. Incluye hora de ingreso, si estaba en la lista y a quién acompaña.

## API

Todos los endpoints piden sesión (cookie), salvo `/api/salud`. Sin sesión responden `401`; sin el
permiso del rol, `403`.

| Método | Ruta                               | Descripción                                                     |
| ------ | ---------------------------------- | --------------------------------------------------------------- |
| GET    | `/api/eventos`                     | Lista de eventos, el más reciente primero                       |
| POST   | `/api/eventos`                     | Crear: `{ nombre, fecha, usaRubros, usaPremiados, rubros[] }`   |
| GET    | `/api/eventos/:id`                 | El evento con sus rubros                                        |
| POST   | `/api/eventos/:id/rubros`          | Agregar un rubro: `{ nombre }`                                  |
| GET    | `/api/eventos/:id/invitados`       | `q`, `rubroId`, `sector`, `confirmacion`, `premiado=si\|no`, `checkin=si\|no`, `pagina`, `porPagina` |
| POST   | `/api/eventos/:id/invitados`       | Alta manual: `{ nombreApellido, empresa, confirmacion, rubroId?, premiado?, cargo?, dni?, sector? }` |
| GET    | `/api/eventos/:id/invitados/:invId` | Ficha del invitado con su historial de ingresos                |
| PATCH  | `/api/eventos/:id/invitados/:invId` | Editar `{ confirmacion?, sector?, premiado?, cargo?, rubroId? }` (también `PUT`). La hora de ingreso no se acepta |
| POST   | `/api/eventos/:id/import`          | multipart: `archivo` (.xlsx) y `confirmar=true` para grabar. Sin `confirmar` solo valida |
| GET    | `/api/eventos/:id/plantilla`       | Plantilla Excel del evento                                      |
| GET    | `/api/eventos/:id/panel`           | Totales, premiados pendientes, desglose por rubro y últimos 15 ingresos |
| POST   | `/api/eventos/:id/checkin`         | `{ invitadoId, clave, corregir? }` → `201` registrado, `200` reintento ya registrado, `409` ya había ingresado (con la hora) |
| POST   | `/api/eventos/:id/checkin/alta`    | Alta en la puerta: `{ nombreApellido, acompanaA, empresa?, dni?, clave }` → `201`, `200` reintento, `409` ya estaba cargado (con sus datos) |
| GET    | `/api/eventos/:id/checkin/qr?codigo=` | Invitado de un QR leído → `200`, `404` desconocido, `409` es de otro evento |
| GET    | `/api/eventos/:id/qr`              | ZIP con los QR de la lista y `codigos.xlsx`                     |
| GET    | `/api/eventos/:id/invitados/:invId/qr` | PNG del QR de un invitado                                   |
| GET    | `/api/eventos/:id/exportar?lista=presentes\|todos` | Excel de presentes o de todos los invitados        |
| GET    | `/api/salud`                       | Healthcheck                                                     |

La búsqueda `q` encuentra palabras en cualquier orden ("Pérez Juan" encuentra a "Juan Pérez") y busca
también por el comienzo del DNI. Errores con formato uniforme: `{ "error": { "mensaje": "...", "detalles": [...] } }`.

## Scripts

| Comando                      | Qué hace                                                   |
| ---------------------------- | ---------------------------------------------------------- |
| `npm run dev`                | Servidor de desarrollo                                     |
| `npm run build` / `start`    | Build y servidor de producción                             |
| `npm test`                   | Tests (Vitest, contra un Postgres en memoria con PGlite)   |
| `npm run lint` / `typecheck` | ESLint / TypeScript                                        |
| `npm run db:up`              | Levanta Postgres en Docker                                 |
| `npm run db:migrate`         | Aplica las migraciones pendientes                          |
| `npm run db:generate`        | Genera una migración nueva tras cambiar `src/db/schema.ts` |
| `npm run excel:generar`      | Regenera la plantilla y los Excel de ejemplo               |
| `npm run usuario:crear`      | Crea un usuario desde la terminal (el primer admin)        |

## Estructura

```
src/
  app/              páginas y endpoints (api/*)
  proxy.ts          sin cookie de sesión, al login
  db/               esquema Drizzle y conexión a Postgres
  lib/
    auth/           roles y permisos, contraseñas, sesiones, usuarios
    checkin/        registro de ingresos y alta en la puerta
    qr/             generación y lectura de códigos QR
    exportar/       Excel de presentes y de invitados
    panel/          métricas del panel en vivo
    eventos/        eventos y rubros
    importacion/    lectura del Excel, validación, importación
    invitados/      constantes, normalización, consultas
drizzle/            migraciones SQL (versionadas)
scripts/            migraciones en el deploy y generación de Excels
tests/              tests de validación, importación, login, check-in, panel, gestión, QR y exportación
ejemplos/           Excel de prueba
docs/               propuesta técnica y guion del video demo
```

## Docker

```bash
docker compose up -d --build     # Postgres + la app en http://localhost:3000
docker compose exec app npm run usuario:crear -- --usuario admin --nombre "Nombre Apellido" --rol admin
```

La imagen (`Dockerfile`, Node 24 Alpine, usuario sin privilegios) aplica las migraciones al arrancar y
tiene healthcheck en `/api/salud`. Variables opcionales: `POSTGRES_PASSWORD`, `PUERTO_APP` (3000),
`PUERTO_POSTGRES` (5432), `COOKIE_SECURE` (`true`; `false` solo para usarlo por `http://` en la red local).
Sin HTTPS adelante, el navegador no guarda la cookie de sesión salvo en `localhost`.

## Deploy

El destino final es el entorno de Misiones Online (vía GitLab, con revisión de seguridad previa). Para
cualquier entorno hace falta:

1. Un PostgreSQL accesible y la variable `DATABASE_URL`.
2. `npm ci && npm run build`.
3. Al iniciar: `npm run db:migrate && npm start`. El healthcheck es `/api/salud`.
4. Una vez: `npm run usuario:crear -- --usuario admin --nombre "..." --rol admin`.
5. Servirlo por HTTPS (la cookie de sesión es `Secure`).

Con Docker, la imagen ya hace los pasos 2 y 3. `railway.json` deja configurado Railway para una demo.
