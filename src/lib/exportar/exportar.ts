import { and, asc, eq, isNotNull, type SQL } from "drizzle-orm";
import ExcelJS from "exceljs";
import type { Db } from "@/db/create-db";
import { invitados, rubros } from "@/db/schema";
import type { EventoConRubros } from "@/lib/eventos/eventos";
import { formatearFechaHoraExacta } from "@/lib/fechas";

export const LISTAS_EXPORTABLES = ["presentes", "todos"] as const;
export type ListaExportable = (typeof LISTAS_EXPORTABLES)[number];

/**
 * Excel con la lista de presentes (tarea 24) o la lista completa con su estado. Solo organizadores
 * (D11). Columnas según lo que usa el evento.
 */
export async function exportarInvitados(db: Db, evento: EventoConRubros, lista: ListaExportable): Promise<ArrayBuffer> {
  const condiciones: SQL[] = [eq(invitados.eventoId, evento.id)];
  if (lista === "presentes") condiciones.push(isNotNull(invitados.checkinEn));

  const filas = await db
    .select({
      nombreApellido: invitados.nombreApellido,
      empresa: invitados.empresa,
      cargo: invitados.cargo,
      dni: invitados.dni,
      rubro: rubros.nombre,
      confirmacion: invitados.confirmacion,
      premiado: invitados.premiado,
      sector: invitados.sector,
      checkinEn: invitados.checkinEn,
      origen: invitados.origen,
      acompanaA: invitados.acompanaA,
    })
    .from(invitados)
    .leftJoin(rubros, eq(rubros.id, invitados.rubroId))
    .where(and(...condiciones))
    .orderBy(lista === "presentes" ? asc(invitados.checkinEn) : asc(invitados.nombreApellido), asc(invitados.id));

  const libro = new ExcelJS.Workbook();
  libro.creator = "Control de Ingreso";
  const hoja = libro.addWorksheet(lista === "presentes" ? "Presentes" : "Invitados");
  hoja.columns = [
    { header: "Nombre y apellido", key: "nombre", width: 30 },
    { header: "Empresa", key: "empresa", width: 30 },
    { header: "Cargo", key: "cargo", width: 22 },
    { header: "DNI", key: "dni", width: 12 },
    ...(evento.usaRubros ? [{ header: "Rubro", key: "rubro", width: 22 }] : []),
    { header: "Confirmación", key: "confirmacion", width: 13 },
    ...(evento.usaPremiados ? [{ header: "Premiado", key: "premiado", width: 10 }] : []),
    { header: "Sector", key: "sector", width: 9 },
    { header: "Ingreso", key: "ingreso", width: 20 },
    { header: "En lista", key: "enLista", width: 9 },
    { header: "Acompaña a", key: "acompanaA", width: 26 },
  ];
  hoja.getRow(1).font = { bold: true };
  hoja.views = [{ state: "frozen", ySplit: 1 }];
  hoja.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: hoja.columns.length } };

  for (const f of filas) {
    hoja.addRow({
      nombre: f.nombreApellido,
      empresa: f.empresa,
      cargo: f.cargo,
      dni: f.dni,
      rubro: f.rubro,
      confirmacion: f.confirmacion,
      premiado: f.premiado ? "SI" : "NO",
      sector: f.sector,
      ingreso: f.checkinEn ? formatearFechaHoraExacta(f.checkinEn) : "",
      enLista: f.origen === "lista" ? "SI" : "NO",
      acompanaA: f.acompanaA,
    });
  }

  const buffer = new Uint8Array(await libro.xlsx.writeBuffer());
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
}
