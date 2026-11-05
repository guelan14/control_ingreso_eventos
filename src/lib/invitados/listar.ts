import { and, asc, eq, isNotNull, isNull, like, or, sql, type SQL } from "drizzle-orm";
import { z } from "@/lib/zod";
import type { Db } from "@/db/create-db";
import { invitados, rubros } from "@/db/schema";
import { CONFIRMACION_VALORES } from "./constants";
import { normalizarComparacion, normalizarDni } from "./normalizar";

const siNo = z.enum(["si", "no"]).transform((v) => v === "si");

export const filtrosInvitadosSchema = z.object({
  q: z.string().trim().max(100).optional(),
  rubroId: z.coerce.number().int().positive().optional(),
  sector: z.string().trim().min(1).optional(),
  confirmacion: z.enum(CONFIRMACION_VALORES).optional(),
  premiado: siNo.optional(),
  checkin: siNo.optional(),
  pagina: z.coerce.number().int().min(1).default(1),
  porPagina: z.coerce.number().int().min(1).max(200).default(50),
});

/** Filtros ya validados (la API los obtiene con `filtrosInvitadosSchema`). */
export type FiltrosInvitados = Partial<z.output<typeof filtrosInvitadosSchema>>;

/** "Pérez Juan" -> ["perez", "juan"]; sin comodines de LIKE. */
function palabrasDeBusqueda(q: string) {
  return normalizarComparacion(q)
    .replace(/[%_\\|]/g, " ")
    .split(" ")
    .filter(Boolean);
}

export async function listarInvitados(db: Db, eventoId: number, filtros: FiltrosInvitados = {}) {
  const pagina = filtros.pagina ?? 1;
  const porPagina = filtros.porPagina ?? 50;
  const condiciones: SQL[] = [eq(invitados.eventoId, eventoId)];
  const palabras = filtros.q ? palabrasDeBusqueda(filtros.q) : [];

  // Cada palabra tiene que aparecer en el nombre o la empresa, en cualquier orden,
  // o ser el comienzo del DNI. clave_nombre ya está sin tildes ni mayúsculas.
  for (const palabra of palabras) {
    condiciones.push(
      or(
        like(invitados.claveNombre, `%${palabra}%`),
        like(invitados.dni, `${normalizarDni(palabra)}%`),
      )!,
    );
  }
  if (filtros.rubroId) condiciones.push(eq(invitados.rubroId, filtros.rubroId));
  if (filtros.sector) condiciones.push(eq(invitados.sector, filtros.sector));
  if (filtros.confirmacion) condiciones.push(eq(invitados.confirmacion, filtros.confirmacion));
  if (filtros.premiado !== undefined) condiciones.push(eq(invitados.premiado, filtros.premiado));
  if (filtros.checkin !== undefined) {
    condiciones.push(filtros.checkin ? isNotNull(invitados.checkinEn) : isNull(invitados.checkinEn));
  }

  const donde = and(...condiciones);
  // Primero los que empiezan exactamente como se escribió ("juan p" antes que "ana juan").
  const orden = [
    ...(palabras.length
      ? [sql`case when ${invitados.claveNombre} like ${`${palabras.join(" ")}%`} then 0 else 1 end`]
      : []),
    asc(invitados.nombreApellido),
    asc(invitados.id),
  ];

  const [data, total] = await Promise.all([
    db
      .select({
        id: invitados.id,
        nombreApellido: invitados.nombreApellido,
        empresa: invitados.empresa,
        cargo: invitados.cargo,
        dni: invitados.dni,
        rubro: rubros.nombre,
        confirmacion: invitados.confirmacion,
        premiado: invitados.premiado,
        sector: invitados.sector,
        checkinEn: invitados.checkinEn,
      })
      .from(invitados)
      .leftJoin(rubros, eq(rubros.id, invitados.rubroId))
      .where(donde)
      .orderBy(...orden)
      .limit(porPagina)
      .offset((pagina - 1) * porPagina),
    db.$count(invitados, donde),
  ]);

  return { data, total, pagina, porPagina };
}
