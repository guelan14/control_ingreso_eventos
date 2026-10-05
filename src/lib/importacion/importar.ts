import { sql } from "drizzle-orm";
import type { Db } from "@/db/create-db";
import { invitados, rubros } from "@/db/schema";
import { COLUMNAS, type CampoOpcional } from "@/lib/invitados/constants";
import { leerHojaInvitados } from "./leer-excel";
import { validarInvitados, type ProblemaImportacion } from "./validar";

export type ReporteImportacion = {
  valido: boolean;
  importado: boolean;
  totalFilas: number;
  filasValidas: number;
  nuevos: number;
  actualizados: number;
  /** Columnas opcionales ausentes: no se tocan esos datos en invitados existentes. */
  columnasOmitidas: CampoOpcional[];
  errores: ProblemaImportacion[];
  advertencias: ProblemaImportacion[];
};

/**
 * Valida el Excel y, si `confirmar` es true y no hay errores, lo carga en la base.
 * Es todo o nada: si una sola fila tiene error no se importa ninguna,
 * así el reporte se puede revisar completo antes de tocar los datos.
 */
export async function importarInvitados(
  db: Db,
  archivo: ArrayBuffer,
  { confirmar }: { confirmar: boolean },
): Promise<ReporteImportacion> {
  const { encabezados, filas } = await leerHojaInvitados(archivo);
  const rubrosValidos = db.select({ nombre: rubros.nombre }).from(rubros).all().map((r) => r.nombre);
  const validacion = validarInvitados(encabezados, filas, rubrosValidos);

  const presentes = new Set(validacion.columnasPresentes);
  const columnasOmitidas = COLUMNAS.filter((c) => !c.requerida && !presentes.has(c.campo)).map(
    (c) => c.campo as CampoOpcional,
  );

  const clavesExistentes = new Set(
    db.select({ clave: invitados.claveUnica }).from(invitados).all().map((r) => r.clave),
  );
  const actualizados = validacion.filasValidas.filter((f) =>
    clavesExistentes.has(f.invitado.claveUnica),
  ).length;

  const valido = validacion.errores.length === 0;
  const reporte: ReporteImportacion = {
    valido,
    importado: false,
    totalFilas: validacion.totalFilas,
    filasValidas: validacion.filasValidas.length,
    nuevos: validacion.filasValidas.length - actualizados,
    actualizados,
    columnasOmitidas,
    errores: validacion.errores,
    advertencias: validacion.advertencias,
  };

  if (!valido || !confirmar) return reporte;

  const actualizarCargo = presentes.has("cargo");
  const actualizarSector = presentes.has("sector");

  db.transaction((tx) => {
    for (const { invitado } of validacion.filasValidas) {
      tx.insert(invitados)
        .values(invitado)
        .onConflictDoUpdate({
          target: invitados.claveUnica,
          // checkin_en nunca se pisa: reimportar en pleno evento no borra ingresos.
          set: {
            nombreApellido: invitado.nombreApellido,
            empresa: invitado.empresa,
            rubro: invitado.rubro,
            confirmacion: invitado.confirmacion,
            premiado: invitado.premiado,
            ...(actualizarCargo && { cargo: invitado.cargo }),
            ...(actualizarSector && { sector: invitado.sector }),
            actualizadoEn: sql`(unixepoch('subsec') * 1000)`,
          },
        })
        .run();
    }
  });

  return { ...reporte, importado: true };
}
