# Control de Ingreso a Eventos

Sistema web para registrar el ingreso de invitados a eventos presenciales, alertar cuando ingresa un
**premiado** y ver estadísticas en vivo. Proyecto de pasantía — Misiones Online 2026.

**Autores:** Miguel Ángel Neumann · Dana Fleita

> Propuesta técnica y decisiones de diseño: [`docs/PROPUESTA.md`](docs/PROPUESTA.md)

## Stack

Next.js 16 (App Router) · TypeScript · SQLite (better-sqlite3) · Drizzle ORM · Zod · Tailwind CSS · Vitest · ExcelJS

## Requisitos

- Node.js 24 o superior
- npm

## Instalación y uso local

```bash
npm install
cp .env.example .env.local   # ajustar si hace falta
npm run dev                  # http://localhost:3000
```

La base de datos se crea sola en `./data/eventos.db` al primer arranque y las migraciones se aplican
automáticamente. No hace falta instalar ningún motor de base de datos.

## Variables de entorno

| Variable        | Por defecto          | Descripción                                   |
| --------------- | -------------------- | --------------------------------------------- |
| `DATABASE_PATH` | `./data/eventos.db`  | Archivo SQLite. En Railway: `/data/eventos.db` |
| `IMPORT_MAX_MB` | `5`                  | Tamaño máximo del Excel a importar            |

## Importar datos de prueba

1. Abrir <http://localhost:3000/importar>
2. Subir `ejemplos/invitados_demo.xlsx` (320 invitados ficticios) → **Validar archivo** → **Confirmar importación**
3. Para ver el reporte de errores, subir `ejemplos/invitados_con_errores.xlsx`

La plantilla oficial vacía (encabezados + 3 filas de ejemplo, con listas desplegables) se descarga desde
la misma pantalla o está en `public/plantilla_invitados.xlsx`.

### Formato del Excel

Hoja llamada **`Invitados`**, encabezados exactos en la fila 1:

| Columna           | Obligatoria | Valores                                                  |
| ----------------- | ----------- | -------------------------------------------------------- |
| `nombre_apellido` | Sí          | Texto                                                    |
| `rubro`           | Sí          | Uno de los rubros cargados (Agroindustria, Comercio, …)  |
| `empresa`         | Sí          | Texto                                                    |
| `cargo`           | No          | Texto                                                    |
| `confirmacion`    | Sí          | `Confirmado` / `No Puede`                                |
| `premiado`        | Sí          | `SI` / `NO` (mayúsculas)                                 |
| `sector`          | No          | Texto (ej. `A`, `Sector B`)                              |

Reglas: la importación es **todo o nada** (si hay un error no se graba nada y se muestra el reporte fila por
fila). Reimportar actualiza por **nombre + empresa** (sin distinguir mayúsculas ni tildes), no duplica y
**nunca borra un check-in ya registrado**. Si falta una columna opcional, ese dato no se modifica.

## API

| Método | Ruta              | Descripción                                                                       |
| ------ | ----------------- | --------------------------------------------------------------------------------- |
| POST   | `/api/import`     | multipart: `archivo` (.xlsx) y `confirmar=true` para grabar. Sin `confirmar` solo valida |
| GET    | `/api/invitados`  | Filtros opcionales: `q`, `rubro`, `sector`, `confirmacion`, `premiado=si\|no`, `checkin=si\|no` |
| GET    | `/api/salud`      | Healthcheck                                                                       |

Errores con formato uniforme: `{ "error": { "mensaje": "...", "detalles": [...] } }`.

## Scripts

| Comando                 | Qué hace                                                    |
| ----------------------- | ----------------------------------------------------------- |
| `npm run dev`           | Servidor de desarrollo                                      |
| `npm run build` / `start` | Build y servidor de producción                            |
| `npm test`              | Tests (Vitest)                                              |
| `npm run lint` / `typecheck` | ESLint / TypeScript                                    |
| `npm run db:generate`   | Genera una migración nueva tras cambiar `src/db/schema.ts`  |
| `npm run excel:generar` | Regenera la plantilla y los Excel de ejemplo                |

## Estructura

```
src/
  app/              páginas y endpoints (api/*)
  db/               esquema Drizzle y conexión SQLite
  lib/
    importacion/    lectura del Excel, validación, importación
    invitados/      constantes, normalización, consultas
drizzle/            migraciones SQL (versionadas)
tests/              tests de validación e importación
ejemplos/           Excel de prueba
```

## Deploy en Railway

1. Crear un proyecto en Railway desde el repositorio de GitHub.
2. Agregar un **Volume** montado en `/data` (sin esto la base se pierde en cada deploy).
3. Variable de entorno: `DATABASE_PATH=/data/eventos.db`.
4. Railway detecta Next.js, ejecuta `npm run build` y arranca con `npm start` (ver `railway.json`).
   El healthcheck usa `/api/salud`.

> No se recomienda Vercel con SQLite: su sistema de archivos es efímero y los check-ins se perderían.
