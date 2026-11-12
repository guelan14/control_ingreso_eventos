# Guion del video demo (≈ 5 minutos)

Grabar en pantalla completa a 1920×1080. Usar dos ventanas: la PC (organizador) y un celular real o el
modo celular del navegador (F12 → dispositivo) para la puerta. Datos: `ejemplos/invitados_demo.xlsx`.

## Preparación (no se graba)

1. Base vacía: `docker compose down -v && docker compose up -d --build`, o borrar `data/pglite`.
2. `npm run usuario:crear -- --usuario admin --nombre "Administrador" --rol admin` e ingresar una vez para
   cambiar la contraseña.
3. Crear el usuario `puerta1` (rol Recepción) y entrar con él en el celular.
4. Elegir de antemano un **premiado confirmado** de la lista (filtro Premiado: Sí) y descargar su QR en
   PNG para mostrarlo desde otra pantalla.
5. Tener a mano `ejemplos/invitados_con_errores.xlsx`.

## Escenas

| # | Tiempo | Pantalla | Qué se hace | Qué se dice |
| --- | --- | --- | --- | --- |
| 1 | 0:00–0:20 | Login | Ingresar como admin | "Sistema de control de ingreso para los eventos de Misiones Online. Cada persona entra con su usuario y su rol." |
| 2 | 0:20–0:45 | Nuevo evento | Crear "Aniversario 2027" con rubros y premiados | "Cada edición es un evento aparte, así queda el historial por año. Los rubros se definen por evento." |
| 3 | 0:45–1:20 | Importar | Subir primero el Excel con errores, mostrar el reporte; después el demo y confirmar | "Antes de grabar se valida todo. Si hay un error no se carga nada y se ve en qué fila está. Con el archivo correcto: 320 invitados." |
| 4 | 1:20–1:45 | Lista de invitados | Filtrar por rubro y por premiado; abrir una ficha con su QR | "La lista se filtra combinando criterios. Cada invitado tiene su QR, que se descarga en un ZIP para enviar o se imprime en tarjetas." |
| 5 | 1:45–2:00 | Códigos QR | Mostrar la página de impresión | "El QR solo lleva un código al azar, no datos personales." |
| 6 | 2:00–2:40 | Celular: check-in | Buscar "perez", tocar, Registrar ingreso. Volver a tocar al mismo: aviso de ya ingresado | "En la puerta se busca mientras se escribe. El ingreso queda con la hora del servidor y quién lo registró. Si alguien quiere entrar dos veces, avisa la hora del primer ingreso." |
| 7 | 2:40–3:10 | Celular: QR | Tocar **QR**, apuntar al QR del premiado: pantalla roja | "Si un premiado llega, la pantalla se pone roja y vibra hasta que el personal confirma: así no pasa desapercibido." |
| 8 | 3:10–3:40 | Celular: alta en la puerta | Buscar un nombre que no existe → "No está en la lista" → completar acompaña a → registrar | "Si llega un acompañante que no estaba en la lista, se lo da de alta ahí mismo y queda indicado a quién acompaña." |
| 9 | 3:40–4:00 | Celular: sin red | Modo avión, registrar a alguien, ver "1 sin enviar"; volver la red y ver que se envía | "Si se corta internet, el ingreso queda guardado en el celular y se envía solo cuando vuelve la conexión, sin duplicarse." |
| 10 | 4:00–4:40 | PC: panel en vivo | Mostrar totales, premiados pendientes, rubros, últimos ingresos con el "sin lista" | "La organización ve en vivo cuántos llegaron, qué premiados faltan y cómo va cada rubro. Se actualiza solo." |
| 11 | 4:40–4:55 | PC: exportar | Descargar presentes y abrir el Excel | "Al terminar se descarga la lista de presentes en Excel, con la hora de cada ingreso." |
| 12 | 4:55–5:10 | Usuarios | Mostrar los roles | "Recepción solo registra ingresos; el panel, los QR y las descargas son de la organización." |

## Cierre

Pantalla final con: nombre del sistema, "Pasantía Misiones Online 2026", Miguel Ángel Neumann y Dana
Fleita, y el enlace al repositorio.

## Cuidados

- No mostrar contraseñas en pantalla (escribirlas antes de grabar o cortar esa parte).
- Usar solo los datos ficticios de `ejemplos/`, nunca una lista real de invitados.
- La cámara del celular necesita HTTPS: grabar contra el deploy de demo o usar `localhost` con el modo
  celular del navegador y una webcam.
