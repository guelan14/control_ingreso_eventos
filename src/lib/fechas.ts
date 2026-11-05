/** Las horas se guardan en UTC y se muestran siempre en hora de Argentina. */
export const ZONA_HORARIA = "America/Argentina/Buenos_Aires";

/** "2027-04-15" -> "15/04/2027". La fecha del evento no tiene hora: no se convierte de zona. */
export function formatearFecha(fecha: string): string {
  const [anio, mes, dia] = fecha.split("-");
  return `${dia}/${mes}/${anio}`;
}

export function formatearHora(instante: Date | string): string {
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: ZONA_HORARIA,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(instante));
}
