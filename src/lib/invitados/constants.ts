/**
 * Rubros sugeridos al crear un evento. Cada evento tiene los suyos (cambian de un año a otro)
 * y los organizadores pueden editarlos.
 */
export const RUBROS_SUGERIDOS = [
  "Agroindustria",
  "Comercio",
  "Automotriz",
  "Trayectoria",
  "Innovación",
  "Construcción e Inmobiliaria",
  "Educación",
  "Finanzas",
  "Foresto-Industria",
  "Industrias",
] as const;

export const CONFIRMACION_VALORES = ["Confirmado", "No Puede"] as const;
export type Confirmacion = (typeof CONFIRMACION_VALORES)[number];

export const PREMIADO_VALORES = ["SI", "NO"] as const;

/** Hoja obligatoria dentro del .xlsx */
export const HOJA_INVITADOS = "Invitados";

/** Qué partes del sistema usa un evento: una charla puede no tener rubros ni premiados. */
export type ConfigEvento = {
  usaRubros: boolean;
  usaPremiados: boolean;
};

/**
 * Columnas del Excel.
 * `requerida`: "siempre", "nunca", o solo si el evento usa rubros / premiados.
 * `alias` cubre la inconsistencia del documento de requisitos ("confirmación" / "confirmacion").
 */
export const COLUMNAS = [
  { campo: "nombre_apellido", requerida: "siempre", alias: [] },
  { campo: "rubro", requerida: "rubros", alias: [] },
  { campo: "empresa", requerida: "siempre", alias: [] },
  { campo: "cargo", requerida: "nunca", alias: [] },
  { campo: "dni", requerida: "nunca", alias: [] },
  { campo: "confirmacion", requerida: "siempre", alias: ["confirmación"] },
  { campo: "premiado", requerida: "premiados", alias: [] },
  { campo: "sector", requerida: "nunca", alias: [] },
] as const;

export type CampoExcel = (typeof COLUMNAS)[number]["campo"];

/** Las columnas que aplican a un evento (las de rubro/premiado desaparecen si no las usa). */
export function columnasDelEvento(config: ConfigEvento) {
  return COLUMNAS.filter(
    (c) =>
      (c.requerida !== "rubros" || config.usaRubros) &&
      (c.requerida !== "premiados" || config.usaPremiados),
  );
}

export function esColumnaRequerida(columna: (typeof COLUMNAS)[number]) {
  return columna.requerida !== "nunca";
}
