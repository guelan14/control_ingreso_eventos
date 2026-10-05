# Propuesta técnica — Sistema de Control de Ingreso a Eventos

Pasantes: Miguel Ángel Neumann y Dana Fleita · Primer avance (Semana 1) · Octubre 2026

## 1. Stack propuesto y justificación

| Pieza | Elección | Por qué |
| --- | --- | --- |
| Framework | **Next.js 16 + TypeScript** | Frontend y API en un solo proyecto y un solo deploy. TypeScript detecta errores antes de llegar al evento. Es lo sugerido en el documento. |
| Base de datos | **SQLite** (better-sqlite3) | Sin servidor de base aparte: un archivo. Sobra para miles de invitados y check-ins de a uno. Modo WAL: el panel lee mientras la puerta escribe. |
| ORM / migraciones | **Drizzle ORM** | Consultas tipadas, migraciones SQL versionadas en Git y aplicadas solas al arrancar. |
| Validación | **Zod** | Una sola definición de reglas para el Excel y los parámetros de la API, con mensajes en español. |
| Excel | **ExcelJS** | Lee y escribe .xlsx (incluye listas desplegables en la plantilla). La versión de `xlsx` publicada en npm está desactualizada. |
| UI | **Tailwind CSS** | Responsive para tablet/celular sin dependencias de componentes pesadas. |
| Tests | **Vitest** | Rápido, compatible con TypeScript, corre en CI. |
| Deploy | **Railway + volumen persistente** | Ver punto 4. |

## 2. Modelo de datos

**invitados**: `id`, `nombre_apellido`, `rubro` (→ rubros), `empresa`, `cargo?`, `confirmacion` (Confirmado / No Puede), `premiado` (bool), `sector?`, `checkin_en?` (fecha y hora exacta, solo lo setea el check-in), `clave_unica` (nombre + empresa normalizados, único), `creado_en`, `actualizado_en`.

**rubros**: `id`, `nombre` (único). Se cargan los 10 rubros base y se pueden agregar más (requisito del panel).

Índices en `checkin_en`, `rubro` y `premiado` para que las consultas del panel sean instantáneas.

## 3. Decisiones de diseño (importación)

- **Previsualizar → confirmar**: el Excel se valida primero y se muestra un reporte fila por fila; recién se graba al confirmar.
- **Todo o nada**: si hay un solo error no se importa ninguna fila (transacción). Evita listas a medio cargar.
- **Sin duplicados**: un invitado se identifica por nombre + empresa, ignorando mayúsculas, tildes y espacios ("JUAN PÉREZ" = "Juan Perez").
- **Reimportar no borra check-ins**: se puede corregir la lista en pleno evento sin perder quién ya entró.
- **Columnas opcionales ausentes** (`cargo`, `sector`): se importa igual y no se pisan esos datos existentes.
- **Rubro tolerante**: "innovacion" se guarda como "Innovación". Confirmación y premiado son estrictos, como pide el documento.
- **Plantilla con listas desplegables** en rubro / confirmación / premiado para prevenir errores desde el origen.
- La búsqueda ignora tildes y mayúsculas ("perez" encuentra "Pérez"): clave para el check-in rápido en puerta.

## 4. Riesgo detectado: Vercel + SQLite

El documento menciona Vercel o Railway. **En Vercel, SQLite no persiste** (sistema de archivos efímero): los check-ins se perderían. Propongo **Railway con un volumen persistente**. Si se prefiere Vercel, habría que pasar a Postgres (Neon/Turso), con poco impacto gracias a Drizzle.

## 5. Buenas prácticas aplicadas

- Lógica de negocio separada de la API y de la UI (`src/lib`), con funciones puras testeables.
- 20 tests automáticos (validación, importación, reimportación, filtros).
- CI en GitHub Actions: lint + typecheck + tests + build en cada push.
- Errores de API con formato uniforme; errores internos se loguean y no exponen detalles.
- Validación de tamaño y tipo de archivo; consultas parametrizadas (sin inyección SQL).
- Migraciones versionadas; configuración por variables de entorno (`.env.example`).
- Healthcheck `/api/salud` para el deploy.

## 6. Estado — Semana 1 ✅

| # | Tarea | Estado |
| --- | --- | --- |
| 01 | Setup Next.js + TypeScript, estructura, variables de entorno | ✅ |
| 02 | Modelo de base SQLite | ✅ |
| 03 | GET /api/invitados con filtros | ✅ (adelantado) |
| 07 | POST /api/import | ✅ |
| 08 | Validación del Excel con reporte fila por fila | ✅ |
| 22 | README | ✅ (se completa con el deploy) |
| — | Plantilla Excel con 3 filas de ejemplo | ✅ |

Próximo: Semana 2 — check-in (buscador en tiempo real, tarjeta, alerta de premiado, doble check-in), QR.

## 7. Preguntas para el equipo

1. El documento escribe la columna como `confirmación` (tabla) y `confirmacion` (reglas). **Hoy se aceptan ambas.** ¿Está bien?
2. Rubros: la lista de importación dice "Construcción" y la del panel "Construcción e Inmobiliaria". ¿Cuál es el nombre oficial?
3. ¿Los invitados "No Puede" deben aparecer en el buscador de check-in (por si vienen igual) o se ocultan?
4. ¿Se necesita login para el panel/gestión, o se usa en red interna? (Propongo al menos una clave de acceso.)
5. Check-in por QR: ¿quién genera y envía los QR a los invitados? ¿El sistema debe generarlos?
6. ¿Un mismo despliegue maneja varios eventos, o uno por evento?
