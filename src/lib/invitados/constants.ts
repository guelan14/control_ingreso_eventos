/** Rubros iniciales. Se guardan en la tabla `rubros` para poder agregar más desde la app. */
export const RUBROS_BASE = [
  "Agroindustria",
  "Comercio",
  "Automotriz",
  "Trayectoria",
  "Innovación",
  "Construcción",
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

/**
 * Columnas del Excel. `alias` cubre la inconsistencia del documento de requisitos,
 * que escribe tanto "confirmación" como "confirmacion".
 */
export const COLUMNAS = [
  { campo: "nombre_apellido", requerida: true, alias: [] },
  { campo: "rubro", requerida: true, alias: [] },
  { campo: "empresa", requerida: true, alias: [] },
  { campo: "cargo", requerida: false, alias: [] },
  { campo: "confirmacion", requerida: true, alias: ["confirmación"] },
  { campo: "premiado", requerida: true, alias: [] },
  { campo: "sector", requerida: false, alias: [] },
] as const;

export type CampoExcel = (typeof COLUMNAS)[number]["campo"];
export type CampoOpcional = Extract<(typeof COLUMNAS)[number], { requerida: false }>["campo"];
