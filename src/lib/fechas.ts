/** Las horas se guardan en UTC y se muestran siempre en hora de Argentina. */
export const ZONA_HORARIA = "America/Argentina/Buenos_Aires";

/** "2027-04-15" -> "15/04/2027". La fecha del evento no tiene hora: no se convierte de zona. */
export function formatearFecha(fecha: string): string {
  const [anio, mes, dia] = fecha.split("-");
  return `${dia}/${mes}/${anio}`;
}

/**
 * Siempre 24 horas: según la versión de ICU, "es-AR" sale como "08:10 p. m.". Se arma a mano con las
 * partes para que sea igual en el servidor, en cualquier navegador y en Excel.
 */
const formato = new Intl.DateTimeFormat("es-AR", {
  timeZone: ZONA_HORARIA,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function partes(instante: Date | string) {
  const v = Object.fromEntries(formato.formatToParts(new Date(instante)).map((p) => [p.type, p.value]));
  return { fecha: `${v.day}/${v.month}/${v.year}`, hm: `${v.hour}:${v.minute}`, s: v.second };
}

/** "20:10" */
export function formatearHora(instante: Date | string): string {
  return partes(instante).hm;
}

/** "20:10:07": la hora exacta, para el registro de ingresos. */
export function formatearHoraExacta(instante: Date | string): string {
  const p = partes(instante);
  return `${p.hm}:${p.s}`;
}

/** "15/04/2027 20:10" en hora de Argentina. */
export function formatearFechaHora(instante: Date | string): string {
  const p = partes(instante);
  return `${p.fecha} ${p.hm}`;
}

/** "15/04/2027 20:10:07": para planillas. */
export function formatearFechaHoraExacta(instante: Date | string): string {
  const p = partes(instante);
  return `${p.fecha} ${p.hm}:${p.s}`;
}
