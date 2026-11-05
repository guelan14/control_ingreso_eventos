import ExcelJS from "exceljs";
import { HOJA_INVITADOS } from "@/lib/invitados/constants";
import type { FilaCruda } from "./validar";

export class ArchivoInvalidoError extends Error {}

export type HojaLeida = { encabezados: unknown[]; filas: FilaCruda[] };

export const LIMITES = {
  filas: 5000,
  columnas: 50,
  /** Tamaño total descomprimido. Un .xlsx de 300 invitados ocupa menos de 1 MB. */
  descomprimidoMb: 50,
};

const ARCHIVO_NO_XLSX =
  "El archivo no es un Excel .xlsx válido. Si es .xls o .csv, guárdelo como .xlsx desde Excel.";

/**
 * Un .xlsx es un ZIP. Antes de descomprimirlo se suma el tamaño declarado de cada archivo
 * interno (directorio central del ZIP), para rechazar "zip bombs" sin cargarlos en memoria.
 */
export function tamanioDescomprimido(archivo: ArrayBuffer): number {
  const vista = new DataView(archivo);
  const FIN_DIRECTORIO = 0x06054b50;
  const ENTRADA = 0x02014b50;

  // El registro de fin de directorio está en los últimos 22 bytes + comentario (máx. 64 KB).
  let fin = -1;
  for (let i = archivo.byteLength - 22; i >= Math.max(0, archivo.byteLength - 65557); i--) {
    if (vista.getUint32(i, true) === FIN_DIRECTORIO) {
      fin = i;
      break;
    }
  }
  if (fin < 0) throw new ArchivoInvalidoError(ARCHIVO_NO_XLSX);

  const entradas = vista.getUint16(fin + 10, true);
  let posicion = vista.getUint32(fin + 16, true);
  let total = 0;
  for (let i = 0; i < entradas; i++) {
    if (posicion + 46 > archivo.byteLength || vista.getUint32(posicion, true) !== ENTRADA) {
      throw new ArchivoInvalidoError(ARCHIVO_NO_XLSX);
    }
    const tamanio = vista.getUint32(posicion + 24, true);
    // 0xFFFFFFFF = formato ZIP64 (archivos de más de 4 GB): nunca es un Excel de invitados.
    if (tamanio === 0xffffffff) return Infinity;
    total += tamanio;
    posicion +=
      46 +
      vista.getUint16(posicion + 28, true) +
      vista.getUint16(posicion + 30, true) +
      vista.getUint16(posicion + 32, true);
  }
  return total;
}

function verificarArchivo(archivo: ArrayBuffer) {
  // Todo ZIP (y por lo tanto todo .xlsx) empieza con "PK\x03\x04".
  const firma = new Uint8Array(archivo, 0, Math.min(4, archivo.byteLength));
  if (firma.length < 4 || firma[0] !== 0x50 || firma[1] !== 0x4b || firma[2] !== 3 || firma[3] !== 4) {
    throw new ArchivoInvalidoError(ARCHIVO_NO_XLSX);
  }
  if (tamanioDescomprimido(archivo) > LIMITES.descomprimidoMb * 1024 * 1024) {
    throw new ArchivoInvalidoError(
      `El contenido del Excel supera los ${LIMITES.descomprimidoMb} MB descomprimido. Verifique que sea la lista de invitados.`,
    );
  }
}

/** Lee la hoja "Invitados" y devuelve los valores como texto, tal como se ven en Excel. */
export async function leerHojaInvitados(archivo: ArrayBuffer): Promise<HojaLeida> {
  verificarArchivo(archivo);

  const libro = new ExcelJS.Workbook();
  try {
    await libro.xlsx.load(archivo);
  } catch {
    throw new ArchivoInvalidoError(ARCHIVO_NO_XLSX);
  }

  const hoja = libro.getWorksheet(HOJA_INVITADOS);
  if (!hoja) {
    const nombres = libro.worksheets.map((h) => `"${h.name}"`).join(", ");
    throw new ArchivoInvalidoError(
      `No se encontró la hoja "${HOJA_INVITADOS}". Hojas del archivo: ${nombres || "ninguna"}.`,
    );
  }
  if (hoja.actualRowCount > LIMITES.filas + 1) {
    throw new ArchivoInvalidoError(
      `La hoja tiene ${hoja.actualRowCount - 1} filas; el máximo es ${LIMITES.filas} invitados por archivo.`,
    );
  }
  if (hoja.actualColumnCount > LIMITES.columnas) {
    throw new ArchivoInvalidoError(
      `La hoja tiene ${hoja.actualColumnCount} columnas; el máximo es ${LIMITES.columnas}.`,
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
