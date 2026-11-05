import { eq } from "drizzle-orm";
import type { Db, Ejecutor } from "@/db/create-db";
import { invitados } from "@/db/schema";
import type { EventoConRubros } from "@/lib/eventos/eventos";
import { columnasDelEvento, esColumnaRequerida, type CampoExcel } from "@/lib/invitados/constants";
import { leerHojaInvitados } from "./leer-excel";
import { validarInvitados, type InvitadoImportado, type ProblemaImportacion } from "./validar";

export type ReporteImportacion = {
  valido: boolean;
  importado: boolean;
  totalFilas: number;
  filasValidas: number;
  nuevos: number;
  actualizados: number;
  /** Columnas opcionales ausentes: no se tocan esos datos en invitados existentes. */
  columnasOmitidas: CampoExcel[];
  errores: ProblemaImportacion[];
  advertencias: ProblemaImportacion[];
};

type Existente = { id: number; dni: string | null; claveNombre: string };
type Accion = { fila: number; invitado: InvitadoImportado; idExistente: number | null };

/**
 * Decide, para cada fila, si actualiza un invitado existente o crea uno nuevo.
 * - Con DNI: se busca por DNI; si no está, por nombre + empresa entre los que no tienen DNI.
 * - Sin DNI: por nombre + empresa. Si hay varios homónimos (con DNI), no se puede saber cuál es.
 */
export function resolverCoincidencias(
  filas: { fila: number; invitado: InvitadoImportado }[],
  existentes: Existente[],
): { acciones: Accion[]; errores: ProblemaImportacion[] } {
  const porDni = new Map(existentes.filter((e) => e.dni).map((e) => [e.dni!, e]));
  const porClave = Map.groupBy(existentes, (e) => e.claveNombre);
  const acciones: Accion[] = [];
  const errores: ProblemaImportacion[] = [];
  // Un existente sin DNI lo puede "reclamar" una sola fila (homónimos con DNI distinto).
  const reclamados = new Set<number>();

  for (const { fila, invitado } of filas) {
    const mismaClave = porClave.get(invitado.claveNombre) ?? [];
    let existente: Existente | undefined;

    if (invitado.dni) {
      existente =
        porDni.get(invitado.dni) ??
        mismaClave.find((e) => e.dni === null && !reclamados.has(e.id));
    } else if (mismaClave.length > 1) {
      errores.push({
        fila,
        campo: "dni",
        mensaje: `Hay ${mismaClave.length} invitados llamados "${invitado.nombreApellido}" en "${invitado.empresa}". Cargue el DNI para saber a cuál corresponde.`,
      });
      continue;
    } else {
      existente = mismaClave[0];
    }
    if (existente) reclamados.add(existente.id);
    acciones.push({ fila, invitado, idExistente: existente?.id ?? null });
  }
  return { acciones, errores };
}

function cargarExistentes(db: Ejecutor, eventoId: number) {
  return db
    .select({ id: invitados.id, dni: invitados.dni, claveNombre: invitados.claveNombre })
    .from(invitados)
    .where(eq(invitados.eventoId, eventoId));
}

/**
 * Valida el Excel contra la configuración del evento y, si `confirmar` es true y no hay errores,
 * lo carga. Es todo o nada: con una sola fila con error no se importa ninguna.
 */
export async function importarInvitados(
  db: Db,
  evento: EventoConRubros,
  archivo: ArrayBuffer,
  { confirmar }: { confirmar: boolean },
): Promise<ReporteImportacion> {
  const { encabezados, filas } = await leerHojaInvitados(archivo);
  const validacion = validarInvitados(encabezados, filas, {
    usaRubros: evento.usaRubros,
    usaPremiados: evento.usaPremiados,
    rubros: evento.rubros.map((r) => r.nombre),
  });

  const presentes = new Set(validacion.columnasPresentes);
  const columnasOmitidas = columnasDelEvento(evento)
    .filter((c) => !esColumnaRequerida(c) && !presentes.has(c.campo))
    .map((c) => c.campo);

  const armarReporte = (acciones: Accion[], erroresExtra: ProblemaImportacion[]) => {
    const errores = [...validacion.errores, ...erroresExtra];
    const actualizados = acciones.filter((a) => a.idExistente !== null).length;
    return {
      valido: errores.length === 0,
      importado: false,
      totalFilas: validacion.totalFilas,
      filasValidas: acciones.length,
      nuevos: acciones.length - actualizados,
      actualizados,
      columnasOmitidas,
      errores,
      advertencias: validacion.advertencias,
    } satisfies ReporteImportacion;
  };

  if (!confirmar || validacion.errores.length > 0) {
    const { acciones, errores } = resolverCoincidencias(
      validacion.filasValidas,
      await cargarExistentes(db, evento.id),
    );
    return armarReporte(acciones, errores);
  }

  const rubroId = new Map(evento.rubros.map((r) => [r.nombre, r.id]));

  return db.transaction(async (tx) => {
    // Se resuelve de nuevo dentro de la transacción: la lista pudo cambiar desde la previsualización.
    const { acciones, errores } = resolverCoincidencias(
      validacion.filasValidas,
      await cargarExistentes(tx, evento.id),
    );
    const reporte = armarReporte(acciones, errores);
    if (!reporte.valido) return reporte;

    for (const { invitado, idExistente } of acciones) {
      const comunes = {
        nombreApellido: invitado.nombreApellido,
        empresa: invitado.empresa,
        claveNombre: invitado.claveNombre,
        confirmacion: invitado.confirmacion,
        ...(evento.usaRubros && { rubroId: rubroId.get(invitado.rubro!) }),
        ...(evento.usaPremiados && { premiado: invitado.premiado }),
      };

      if (idExistente === null) {
        await tx.insert(invitados).values({
          ...comunes,
          eventoId: evento.id,
          cargo: invitado.cargo,
          dni: invitado.dni,
          sector: invitado.sector,
        });
      } else {
        // Una celda opcional vacía no borra el dato existente (A1). checkin_en nunca se toca.
        await tx
          .update(invitados)
          .set({
            ...comunes,
            ...(invitado.cargo !== null && { cargo: invitado.cargo }),
            ...(invitado.dni !== null && { dni: invitado.dni }),
            ...(invitado.sector !== null && { sector: invitado.sector }),
          })
          .where(eq(invitados.id, idExistente));
      }
    }
    return { ...reporte, importado: true };
  });
}
