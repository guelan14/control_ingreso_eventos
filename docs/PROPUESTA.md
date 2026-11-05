# Propuesta técnica — Sistema de Control de Ingreso a Eventos

Pasantes: Miguel Ángel Neumann y Dana Fleita · Actualizada en noviembre de 2026 con las respuestas de Misiones Online

## 1. Stack propuesto y justificación

| Pieza | Elección | Por qué |
| --- | --- | --- |
| Framework | **Next.js 16 + TypeScript** | Frontend y API en un solo proyecto y un solo deploy. TypeScript detecta errores antes de llegar al evento. Es lo sugerido en el documento. |
| Base de datos | **PostgreSQL** | Ver punto 4. Estándar en servidores y en entornos empresariales, con usuarios, permisos y backups. |
| ORM / migraciones | **Drizzle ORM** | Consultas tipadas y migraciones SQL versionadas en Git. |
| Validación | **Zod** | Una sola definición de reglas para el Excel y los parámetros de la API, con mensajes en español. |
| Excel | **ExcelJS** | Lee y escribe .xlsx (incluye listas desplegables en la plantilla). La versión de `xlsx` publicada en npm está desactualizada. |
| UI | **Tailwind CSS** | Responsive para tablet/celular sin dependencias de componentes pesadas. |
| Tests | **Vitest + PGlite** | Los tests corren contra un Postgres real en memoria, sin instalar nada. |
| Deploy | **Entorno de Misiones Online (GitLab)** | Definido en D12. `railway.json` queda para demos. |

## 2. Modelo de datos

**eventos**: `id`, `nombre`, `fecha`, `usa_rubros`, `usa_premiados`. Una fila por edición: el aniversario de cada año queda como historial (D10). Un evento simple, como una charla, desactiva rubros y premiados.

**rubros**: `id`, `evento_id`, `nombre`. Cada evento tiene los suyos, porque cambian de un año a otro (D8).

**invitados**: `id`, `evento_id`, `nombre_apellido`, `empresa`, `cargo?`, `dni?`, `rubro_id?`, `confirmacion` (Confirmado / No Puede), `premiado`, `sector?`, `checkin_en?` (solo lo setea el check-in), `clave_nombre` (nombre + empresa normalizados, para buscar e identificar sin DNI).

Unicidad dentro de cada evento: el DNI cuando está cargado; nombre + empresa cuando no. Así se aceptan homónimos con DNI distinto (D4).

## 3. Decisiones de diseño (importación)

- **Previsualizar → confirmar**: el Excel se valida primero y se muestra un reporte fila por fila; recién se graba al confirmar.
- **Todo o nada**: si hay un solo error no se importa ninguna fila (transacción). Evita listas a medio cargar.
- **Identidad**: por DNI si lo tiene; si no, por nombre + empresa ignorando mayúsculas, tildes y espacios ("JUAN PÉREZ" = "Juan Perez"). Si un invitado sin DNI se reimporta con DNI, se actualiza el mismo.
- **Reimportar no borra check-ins** ni datos opcionales: una celda vacía de `cargo`, `sector` o `dni` no pisa lo que ya estaba.
- **Columnas según el evento**: `rubro` y `premiado` solo son obligatorias si el evento las usa.
- **Rubro tolerante**: "innovacion" se guarda como "Innovación". Confirmación y premiado son estrictos, como pide el documento.
- **Plantilla por evento**, con sus columnas y sus rubros en listas desplegables.
- **Archivos no confiables**: se verifica que sea un ZIP real y se rechaza antes de descomprimir si supera 50 MB descomprimido; máximo 5000 filas y 50 columnas.
- **Búsqueda** por palabras en cualquier orden, sin tildes ni mayúsculas, y por DNI: clave para el check-in rápido en puerta.

## 4. Cambio de base de datos: de SQLite a PostgreSQL

Las respuestas de Misiones Online cambiaron el escenario:

- **La nube es la principal y la notebook queda de respaldo (D2).** Para un servidor en la nube, Postgres es el estándar y no depende de un disco persistente.
- **Historial por año (D10).** Los datos crecen con cada edición; Postgres tiene backups y restauración estándar.
- **Revisión de seguridad y arquitectura (D12).** Usuarios, permisos y conexiones cifradas facilitan la aprobación.
- **Respaldo local.** Con el mismo motor en la nube y en la notebook, la sincronización es más simple.

El cambio se hizo antes de construir el check-in, cuando solo afectaba la capa de acceso a datos. Si el entorno de Misiones Online exige otro motor, pedimos que nos avisen con tiempo.

## 5. Buenas prácticas aplicadas

- Lógica de negocio separada de la API y de la UI (`src/lib`), con funciones puras testeables.
- 35 tests automáticos (validación, importación, reimportación, DNI, eventos, filtros, límites de archivo).
- CI en GitHub Actions: lint + typecheck + tests + build en cada push.
- Errores de API con formato uniforme; errores internos se loguean y no exponen detalles.
- Consultas parametrizadas (sin inyección SQL); listado paginado.
- Migraciones versionadas; configuración por variables de entorno (`.env.example`).
- El build no depende de internet (fuente incluida en el repo).
- Healthcheck `/api/salud` para el deploy.

## 6. Estado

| Tarea | Estado |
| --- | --- |
| Setup Next.js + TypeScript, estructura, variables de entorno | ✅ |
| Modelo PostgreSQL con varios eventos, rubros por evento y DNI opcional | ✅ |
| Importación con validación fila por fila, plantilla por evento | ✅ |
| Correcciones del Análisis #1: A1, A2 (parcial, con DNI), A4, A5 (paginado), M1, M4 | ✅ |
| Alta de eventos y rubros (API y pantalla) | ✅ |
| Login con usuarios y roles (C1) | Siguiente |
| Check-in con tabla de registros, doble ingreso y alerta de premiado (C2) | Siguiente |
| Panel, gestión, QR, alta en puerta con acompañante | Pendiente |
| Respaldo local (notebook espejo) | Pendiente |

## 7. Preguntas pendientes para Misiones Online

Las 12 preguntas anteriores están respondidas en `docs/preguntas_respuestas_misiones_online (1).docx`. Quedan:

1. ¿Qué ofrece su entorno de deploy? (Docker, motor y versión de base de datos, HTTPS, requisitos de la revisión de seguridad.)
2. GitLab: ¿ustedes nos dan acceso a su GitLab, o al revés? ¿Hay que migrar el repositorio ya?
3. Envío automático de QR por mail o WhatsApp: ¿es obligatorio para abril? ¿Tienen servidor de mail y WhatsApp Business?
4. En eventos simples, ¿`empresa` y `confirmacion` siguen siendo obligatorias?
5. Respaldo: ¿quién lo opera el día del evento, y quién provee el router y la UPS?
