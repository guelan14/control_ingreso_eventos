import ExcelJS from "exceljs";
import {
  COLUMNAS,
  CONFIRMACION_VALORES,
  HOJA_INVITADOS,
  PREMIADO_VALORES,
  RUBROS_BASE,
} from "@/lib/invitados/constants";

export type FilaPlantilla = Record<string, string | null | undefined>;

const ENCABEZADOS = COLUMNAS.map((c) => c.campo);
const FILAS_CON_VALIDACION = 2000;

/**
 * Genera un .xlsx con el formato oficial. Incluye listas desplegables en
 * rubro / confirmacion / premiado para que el organizador no pueda tipear un valor inválido.
 */
export async function crearLibroInvitados(
  filas: FilaPlantilla[],
  encabezados: readonly string[] = ENCABEZADOS,
): Promise<ArrayBuffer> {
  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet(HOJA_INVITADOS);

  hoja.columns = encabezados.map((h) => ({ header: h, key: h, width: Math.max(14, h.length + 4) }));
  hoja.getRow(1).font = { bold: true };
  hoja.views = [{ state: "frozen", ySplit: 1 }];
  filas.forEach((f) => hoja.addRow(f));

  const listas: Record<string, readonly string[]> = {
    rubro: RUBROS_BASE,
    confirmacion: CONFIRMACION_VALORES,
    premiado: PREMIADO_VALORES,
  };
  encabezados.forEach((encabezado, i) => {
    const lista = listas[encabezado];
    if (!lista) return;
    const columna = hoja.getColumn(i + 1);
    for (let fila = 2; fila <= FILAS_CON_VALIDACION; fila++) {
      hoja.getCell(fila, columna.number).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: [`"${lista.join(",")}"`],
        showErrorMessage: true,
        errorTitle: "Valor no válido",
        error: `Valores aceptados: ${lista.join(", ")}`,
      };
    }
  });

  return (await libro.xlsx.writeBuffer()) as ArrayBuffer;
}

export const FILAS_EJEMPLO: FilaPlantilla[] = [
  {
    nombre_apellido: "María González",
    rubro: "Agroindustria",
    empresa: "Yerbatera del Alto Uruguay - Sede Oberá",
    cargo: "Gerente General",
    confirmacion: "Confirmado",
    premiado: "SI",
    sector: "A",
  },
  {
    nombre_apellido: "Juan Pérez",
    rubro: "Comercio",
    empresa: "Distribuidora Posadas",
    cargo: "Director Comercial",
    confirmacion: "Confirmado",
    premiado: "NO",
    sector: "B",
  },
  {
    nombre_apellido: "Laura Fernández",
    rubro: "Educación",
    empresa: "Instituto Misionero",
    cargo: null,
    confirmacion: "No Puede",
    premiado: "NO",
    sector: null,
  },
];
