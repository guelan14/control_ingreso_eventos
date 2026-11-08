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

**usuarios**: `id`, `usuario` (único, sin email: el personal de puerta puede no tener), `nombre`, `clave_hash`, `rol`, `activo`, `debe_cambiar_clave`, `intentos_fallidos`, `bloqueado_hasta`, `ultimo_ingreso`.

**sesiones**: `id` (hash del token de la cookie), `usuario_id`, `expira_en`.

**checkins** (solo se agregan filas): `id`, `evento_id`, `invitado_id`, `registrado_en`, `tipo` (ingreso / corrección), `hora_anterior?`, `usuario_id`, `dispositivo`, `clave_idempotencia` (única). `invitados.checkin_en` es la copia de la hora vigente, para que buscar y contar sea rápido (recomendación C2 del Análisis #1).

## 3 ter. Check-in en puerta (C2)

- **Hora del servidor**, no del celular: los relojes de los dispositivos no coinciden.
- **Doble ingreso**: avisa la hora anterior y no la cambia. Corregirla exige confirmar y queda como fila `correccion` con la hora que tenía.
- **Dos celulares a la vez** con la misma persona: la fila del invitado se bloquea dentro de la transacción y entra uno solo.
- **Cortes de red** (tarea 21): cada toque genera una clave única; el pedido se guarda en el dispositivo antes de enviarse y se reintenta solo. El servidor reconoce la clave y no registra dos veces.
- **Premiado**: alerta roja a pantalla completa con vibración, que no se cierra sola (un premiado no puede pasar desapercibido). Si avisó que no venía, se permite el ingreso con aviso (D5).
- Pendiente: alta rápida en la puerta de quien no está en la lista, con "acompaña a" (D6), y check-in por QR (tarea 23).

## 3 bis. Usuarios y roles (C1)

Roles según quién usa cada pantalla (D3, D8, D11):

| Rol | Quién | Puede |
| --- | --- | --- |
| Administrador | Sistemas / responsable | Todo, incluida la gestión de usuarios |
| Organizador | Organización y equipo de invitaciones | Eventos, rubros, importación, lista; luego panel y descargas |
| Recepción | Personal de la puerta | Ver eventos y buscar invitados; luego registrar ingresos |

- **Sesiones en la base**, no un token firmado: se pueden cerrar desde el servidor (al desactivar a alguien o si se pierde un celular). Duran 12 horas, una jornada de evento.
- **Contraseñas con scrypt** (incluido en Node). Las asigna el administrador como temporales y cada uno elige la suya al ingresar.
- **Bloqueo** de 15 minutos tras 5 intentos fallidos. El mismo mensaje para usuario inexistente y contraseña incorrecta.
- **Permisos en un solo archivo** y controlados en cada pantalla, endpoint y acción del servidor. El proxy solo redirige al login si no hay cookie.
- **Primer administrador** por terminal (`npm run usuario:crear`), no desde una pantalla abierta: en un servidor publicado, cualquiera podría crearlo primero.
- Pendiente para la revisión de seguridad: límite de intentos por IP (conviene en el proxy inverso del entorno) y registro de auditoría de acciones.

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
- 67 tests automáticos (validación, importación, reimportación, DNI, eventos, filtros, límites de archivo, login, sesiones, bloqueo, permisos, check-in, doble ingreso, reintentos, concurrencia).
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
| Login con usuarios y roles (C1) | ✅ |
| Check-in con tabla de registros, doble ingreso, alerta de premiado y reintentos sin red (C2, tareas 04, 09–12, 20, 21) | ✅ |
| Alta rápida en la puerta con acompañante (D6) | Siguiente |
| Check-in por QR (tarea 23) | Pendiente |
| Panel, gestión, QR, alta en puerta con acompañante | Pendiente |
| Respaldo local (notebook espejo) | Pendiente |

## 7. Preguntas pendientes para Misiones Online

Las 12 preguntas anteriores están respondidas en `docs/preguntas_respuestas_misiones_online (1).docx`. Quedan:

1. ¿Qué ofrece su entorno de deploy? (Docker, motor y versión de base de datos, HTTPS, requisitos de la revisión de seguridad.)
2. GitLab: ¿ustedes nos dan acceso a su GitLab, o al revés? ¿Hay que migrar el repositorio ya?
3. Envío automático de QR por mail o WhatsApp: ¿es obligatorio para abril? ¿Tienen servidor de mail y WhatsApp Business?
4. En eventos simples, ¿`empresa` y `confirmacion` siguen siendo obligatorias?
5. Respaldo: ¿quién lo opera el día del evento, y quién provee el router y la UPS?
