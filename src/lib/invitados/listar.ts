import { and, asc, eq, isNotNull, isNull, like, type SQL } from "drizzle-orm";
import { z } from "@/lib/zod";
import type { Db } from "@/db/create-db";
import { invitados } from "@/db/schema";
import { CONFIRMACION_VALORES } from "./constants";
import { normalizarComparacion } from "./normalizar";

const siNo = z.enum(["si", "no"]).transform((v) => v === "si");

export const filtrosInvitadosSchema = z.object({
  q: z.string().trim().max(100).optional(),
  rubro: z.string().trim().min(1).optional(),
  sector: z.string().trim().min(1).optional(),
  confirmacion: z.enum(CONFIRMACION_VALORES).optional(),
  premiado: siNo.optional(),
  checkin: siNo.optional(),
});

export type FiltrosInvitados = z.infer<typeof filtrosInvitadosSchema>;

export function listarInvitados(db: Db, filtros: FiltrosInvitados) {
  const condiciones: SQL[] = [];

  if (filtros.q) {
    // clave_unica ya está normalizada (sin tildes, minúsculas): "perez" encuentra "Pérez".
    const termino = normalizarComparacion(filtros.q).replace(/[%_]/g, "");
    if (termino) condiciones.push(like(invitados.claveUnica, `%${termino}%`));
  }
  if (filtros.rubro) condiciones.push(eq(invitados.rubro, filtros.rubro));
  if (filtros.sector) condiciones.push(eq(invitados.sector, filtros.sector));
  if (filtros.confirmacion) condiciones.push(eq(invitados.confirmacion, filtros.confirmacion));
  if (filtros.premiado !== undefined) condiciones.push(eq(invitados.premiado, filtros.premiado));
  if (filtros.checkin !== undefined) {
    condiciones.push(filtros.checkin ? isNotNull(invitados.checkinEn) : isNull(invitados.checkinEn));
  }

  return db
    .select({
      id: invitados.id,
      nombreApellido: invitados.nombreApellido,
      rubro: invitados.rubro,
      empresa: invitados.empresa,
      cargo: invitados.cargo,
      confirmacion: invitados.confirmacion,
      premiado: invitados.premiado,
      sector: invitados.sector,
      checkinEn: invitados.checkinEn,
    })
    .from(invitados)
    .where(and(...condiciones))
    .orderBy(asc(invitados.nombreApellido))
    .all();
}
