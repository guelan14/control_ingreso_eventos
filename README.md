# Control de Ingreso a Eventos

Sistema web para registrar el ingreso de invitados a eventos presenciales, alertar cuando ingresa un
**premiado** y ver estadísticas en vivo. Maneja varios eventos con historial por edición (por ejemplo, el
aniversario de cada año) y también eventos simples sin rubros ni premiados. Proyecto de pasantía —
Misiones Online 2026.

**Autores:** Miguel Ángel Neumann · Dana Fleita

> Propuesta técnica y decisiones de diseño: [`docs/PROPUESTA.md`](docs/PROPUESTA.md)

## Stack

Next.js 16 (App Router) · TypeScript · PostgreSQL · Drizzle ORM · Zod · Tailwind CSS · Vitest + PGlite · ExcelJS

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

## Variables de entorno

| Variable        | Ejemplo                                           | Descripción                          |
| --------------- | ------------------------------------------------- | ------------------------------------ |
| `DATABASE_URL`  | `postgres://eventos:eventos@localhost:5432/eventos` | Conexión a Postgres, o `pglite://<carpeta>` |
| `IMPORT_MAX_MB` | `5`                                               | Tamaño máximo del Excel a importar   |

## Importar datos de prueba

1. Abrir <http://localhost:3000> → **Nuevo evento** (los rubros sugeridos ya vienen cargados).
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

## API

| Método | Ruta                               | Descripción                                                     |
| ------ | ---------------------------------- | --------------------------------------------------------------- |
| GET    | `/api/eventos`                     | Lista de eventos, el más reciente primero                       |
| POST   | `/api/eventos`                     | Crear: `{ nombre, fecha, usaRubros, usaPremiados, rubros[] }`   |
| GET    | `/api/eventos/:id`                 | El evento con sus rubros                                        |
| POST   | `/api/eventos/:id/rubros`          | Agregar un rubro: `{ nombre }`                                  |
| GET    | `/api/eventos/:id/invitados`       | `q`, `rubroId`, `sector`, `confirmacion`, `premiado=si\|no`, `checkin=si\|no`, `pagina`, `porPagina` |
| POST   | `/api/eventos/:id/import`          | multipart: `archivo` (.xlsx) y `confirmar=true` para grabar. Sin `confirmar` solo valida |
| GET    | `/api/eventos/:id/plantilla`       | Plantilla Excel del evento                                      |
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

## Estructura

```
src/
  app/              páginas y endpoints (api/*)
  db/               esquema Drizzle y conexión a Postgres
  lib/
    eventos/        eventos y rubros
    importacion/    lectura del Excel, validación, importación
    invitados/      constantes, normalización, consultas
drizzle/            migraciones SQL (versionadas)
scripts/            migraciones en el deploy y generación de Excels
tests/              tests de validación e importación
ejemplos/           Excel de prueba
```

## Deploy

El destino final es el entorno de Misiones Online (vía GitLab, con revisión de seguridad previa). Para
cualquier entorno hace falta:

1. Un PostgreSQL accesible y la variable `DATABASE_URL`.
2. `npm ci && npm run build`.
3. Al iniciar: `npm run db:migrate && npm start`. El healthcheck es `/api/salud`.

`railway.json` deja configurado Railway con esos comandos para una demo.
