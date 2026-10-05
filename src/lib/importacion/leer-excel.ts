import ExcelJS from "exceljs";
import { HOJA_INVITADOS } from "@/lib/invitados/constants";
import type { FilaCruda } from "./validar";

export class ArchivoInvalidoError extends Error {}

export type HojaLeida = { encabezados: unknown[]; filas: FilaCruda[] };

/** Lee la hoja "Invitados" y devuelve los valores como texto, tal como se ven en Excel. */
export async function leerHojaInvitados(archivo: ArrayBuffer): Promise<HojaLeida> {
  const libro = new ExcelJS.Workbook();
  try {
    await libro.xlsx.load(archivo);
  } catch {
    throw new ArchivoInvalidoError(
      "El archivo no es un Excel .xlsx válido. Si es .xls o .csv, guárdelo como .xlsx desde Excel.",
    );
  }

  const hoja = libro.getWorksheet(HOJA_INVITADOS);
  if (!hoja) {
    const nombres = libro.worksheets.map((h) => `"${h.name}"`).join(", ");
    throw new ArchivoInvalidoError(
      `No se encontró la hoja "${HOJA_INVITADOS}". Hojas del archivo: ${nombres || "ninguna"}.`,
    );
  }

  const textoDeFila = (fila: ExcelJS.Row) => {
    const celdas: unknown[] = [];
    // `cell.text` resuelve fórmulas, texto enriquecido e hipervínculos al valor visible.
    fila.eachCell({ includeEmpty: true }, (celda, columna) => {
      celdas[columna - 1] = celda.text;
    });
    return celdas;
  };

  const encabezados = textoDeFila(hoja.getRow(1));
  const filas: FilaCruda[] = [];
  hoja.eachRow((fila, numero) => {
    if (numero > 1) filas.push({ fila: numero, celdas: textoDeFila(fila) });
  });

  return { encabezados, filas };
}
