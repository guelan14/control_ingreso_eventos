import ExcelJS from "exceljs";
import {
  CONFIRMACION_VALORES,
  HOJA_INVITADOS,
  PREMIADO_VALORES,
  RUBROS_SUGERIDOS,
  columnasDelEvento,
  type ConfigEvento,
} from "@/lib/invitados/constants";

export type FilaPlantilla = Record<string, string | null | undefined>;

export type OpcionesPlantilla = ConfigEvento & {
  rubros: readonly string[];
  /** Para tests: encabezados arbitrarios en lugar de los del evento. */
  encabezados?: readonly string[];
};

const FILAS_CON_VALIDACION = 2000;
const HOJA_LISTAS = "Listas";

export const OPCIONES_POR_DEFECTO: OpcionesPlantilla = {
  usaRubros: true,
  usaPremiados: true,
  rubros: RUBROS_SUGERIDOS,
};

/**
 * Genera un .xlsx con las columnas que usa el evento y listas desplegables en
 * rubro / confirmacion / premiado, para que no se pueda tipear un valor inválido.
 * Las opciones van en una hoja oculta: una lista escrita en la fórmula no admite
 * más de 255 caracteres, y un evento puede tener muchos rubros.
 */
export async function crearLibroInvitados(
  filas: FilaPlantilla[],
  opciones: OpcionesPlantilla = OPCIONES_POR_DEFECTO,
): Promise<ArrayBuffer> {
  const encabezados = opciones.encabezados ?? columnasDelEvento(opciones).map((c) => c.campo);
  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet(HOJA_INVITADOS);
  const listas = libro.addWorksheet(HOJA_LISTAS, { state: "veryHidden" });

  hoja.columns = encabezados.map((h) => ({ header: h, key: h, width: Math.max(14, h.length + 4) }));
  hoja.getRow(1).font = { bold: true };
  hoja.views = [{ state: "frozen", ySplit: 1 }];
  filas.forEach((f) => hoja.addRow(f));

  const valoresPorColumna: Record<string, readonly string[]> = {
    rubro: opciones.rubros,
    confirmacion: CONFIRMACION_VALORES,
    premiado: PREMIADO_VALORES,
  };

  let columnaLista = 0;
  encabezados.forEach((encabezado, i) => {
    const valores = valoresPorColumna[encabezado];
    if (!valores?.length) return;

    columnaLista++;
    valores.forEach((v, fila) => (listas.getCell(fila + 1, columnaLista).value = v));
    const letra = listas.getColumn(columnaLista).letter;
    const rango = `${HOJA_LISTAS}!$${letra}$1:$${letra}$${valores.length}`;

    for (let fila = 2; fila <= FILAS_CON_VALIDACION; fila++) {
      hoja.getCell(fila, i + 1).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: [rango],
        showErrorMessage: true,
        errorTitle: "Valor no válido",
        error: "Elija un valor de la lista.",
      };
    }
  });

  // En Node, ExcelJS devuelve un Buffer (una vista sobre memoria compartida), no un ArrayBuffer propio.
  const buffer = new Uint8Array(await libro.xlsx.writeBuffer());
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
}

export const FILAS_EJEMPLO: FilaPlantilla[] = [
  {
    nombre_apellido: "María González",
    rubro: "Agroindustria",
    empresa: "Yerbatera del Alto Uruguay - Sede Oberá",
    cargo: "Gerente General",
    dni: "28.456.789",
    confirmacion: "Confirmado",
    premiado: "SI",
    sector: "A",
  },
  {
    nombre_apellido: "Juan Pérez",
    rubro: "Comercio",
    empresa: "Distribuidora Posadas",
    cargo: "Director Comercial",
    dni: null,
    confirmacion: "Confirmado",
    premiado: "NO",
    sector: "B",
  },
  {
    nombre_apellido: "Laura Fernández",
    rubro: "Educación",
    empresa: "Instituto Misionero",
    cargo: null,
    dni: null,
    confirmacion: "No Puede",
    premiado: "NO",
    sector: null,
  },
];
