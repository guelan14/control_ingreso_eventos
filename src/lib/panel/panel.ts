import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import type { Db } from "@/db/create-db";
import { checkins, invitados, rubros } from "@/db/schema";
import type { EventoConRubros } from "@/lib/eventos/eventos";
import type { Panel } from "./tipos";

export const CANTIDAD_ULTIMOS = 15;

const contar = (condicion: ReturnType<typeof sql>) => sql<number>`count(*) filter (where ${condicion})`.mapWith(Number);

/**
 * Todo lo que muestra el panel, en 4 consultas indexadas por evento. Con 300-1000 invitados tarda
 * milisegundos, así que se puede pedir cada 15 segundos desde varios dispositivos sin problema.
 */
export async function obtenerPanel(db: Db, evento: EventoConRubros, ahora = new Date()): Promise<Panel> {
  const delEvento = eq(invitados.eventoId, evento.id);
  // D7: quien llega sin estar en la lista suma a los ingresados, pero no a confirmados ni a invitaciones.
  const deLista = sql`${invitados.origen} = 'lista'`;
  const confirmado = sql`${deLista} and ${invitados.confirmacion} = 'Confirmado'`;
  const ingreso = sql`${invitados.checkinEn} is not null`;

  const [totales] = await db
    .select({
      invitados: contar(deLista),
      confirmados: contar(confirmado),
      ingresados: contar(ingreso),
      sinLista: contar(sql`${invitados.origen} = 'puerta' and ${ingreso}`),
      faltan: contar(sql`${confirmado} and ${invitados.checkinEn} is null`),
      premiados: contar(sql`${invitados.premiado}`),
      premiadosIngresados: contar(sql`${invitados.premiado} and ${ingreso}`),
    })
    .from(invitados)
    .where(delEvento);

  const [pendientes, porRubro, ultimos] = await Promise.all([
    evento.usaPremiados
      ? db
          .select({
            id: invitados.id,
            nombreApellido: invitados.nombreApellido,
            empresa: invitados.empresa,
            cargo: invitados.cargo,
            rubro: rubros.nombre,
            sector: invitados.sector,
            confirmacion: invitados.confirmacion,
          })
          .from(invitados)
          .leftJoin(rubros, eq(rubros.id, invitados.rubroId))
          .where(and(delEvento, eq(invitados.premiado, true), isNull(invitados.checkinEn)))
          .orderBy(asc(invitados.nombreApellido))
      : Promise.resolve([]),
    evento.usaRubros
      ? db
          .select({
            id: rubros.id,
            nombre: rubros.nombre,
            invitados: sql<number>`count(${invitados.id})`.mapWith(Number),
            confirmados: contar(confirmado),
            ingresados: contar(ingreso),
          })
          .from(rubros)
          .leftJoin(invitados, eq(invitados.rubroId, rubros.id))
          .where(eq(rubros.eventoId, evento.id))
          .groupBy(rubros.id, rubros.nombre)
          .orderBy(asc(rubros.nombre))
      : Promise.resolve([]),
    db
      .select({
        id: checkins.id,
        nombreApellido: invitados.nombreApellido,
        empresa: invitados.empresa,
        premiado: invitados.premiado,
        tipo: checkins.tipo,
        registradoEn: checkins.registradoEn,
        origen: invitados.origen,
      })
      .from(checkins)
      .innerJoin(invitados, eq(invitados.id, checkins.invitadoId))
      .where(eq(checkins.eventoId, evento.id))
      .orderBy(desc(checkins.registradoEn), desc(checkins.id))
      .limit(CANTIDAD_ULTIMOS),
  ]);

  const sinConfirmacion = (p: (typeof pendientes)[number]) => ({
    id: p.id,
    nombreApellido: p.nombreApellido,
    empresa: p.empresa,
    cargo: p.cargo,
    rubro: p.rubro,
    sector: p.sector,
  });

  return {
    generadoEn: ahora.toISOString(),
    totales: {
      invitados: totales.invitados,
      confirmados: totales.confirmados,
      ingresados: totales.ingresados,
      sinLista: totales.sinLista,
      faltan: totales.faltan,
    },
    premiados: {
      total: totales.premiados,
      ingresados: totales.premiadosIngresados,
      pendientes: pendientes.filter((p) => p.confirmacion === "Confirmado").map(sinConfirmacion),
      avisaronQueNoVienen: pendientes.filter((p) => p.confirmacion === "No Puede").map(sinConfirmacion),
    },
    rubros: porRubro,
    ultimos: ultimos.map((u) => ({ ...u, registradoEn: u.registradoEn.toISOString() })),
  };
}