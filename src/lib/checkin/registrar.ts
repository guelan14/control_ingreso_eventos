import { and, eq, sql } from "drizzle-orm";
import type { Db, Ejecutor } from "@/db/create-db";
import { checkins, invitados, rubros } from "@/db/schema";
import { z } from "@/lib/zod";

export const pedidoCheckinSchema = z.object({
  invitadoId: z.number().int().positive(),
  /** Clave única por toque del botón, generada en el dispositivo. */
  clave: z.string().regex(/^[A-Za-z0-9-]{16,64}$/, "Clave de idempotencia inválida."),
  /** Solo con confirmación explícita del operador se reemplaza la hora de un ingreso ya registrado. */
  corregir: z.boolean().default(false),
});
export type PedidoCheckin = z.output<typeof pedidoCheckinSchema>;

/** Lo que la pantalla de puerta necesita para la tarjeta y la alerta. */
export type InvitadoCheckin = {
  id: number;
  nombreApellido: string;
  empresa: string;
  cargo: string | null;
  sector: string | null;
  rubro: string | null;
  premiado: boolean;
  confirmacion: "Confirmado" | "No Puede";
  checkinEn: Date | null;
};

export type ResultadoCheckin =
  /** Grabado ahora (o ya grabado antes con la misma clave: un reintento de red). */
  | { estado: "registrado"; invitado: InvitadoCheckin; horaAnterior: Date | null; reintento: boolean }
  /** Ya tenía ingreso y no se pidió corregir: no se toca nada. */
  | { estado: "ya_ingresado"; invitado: InvitadoCheckin }
  | { estado: "no_encontrado" };

async function invitadoParaCheckin(db: Ejecutor, eventoId: number, invitadoId: number) {
  const [fila] = await db
    .select({
      id: invitados.id,
      nombreApellido: invitados.nombreApellido,
      empresa: invitados.empresa,
      cargo: invitados.cargo,
      sector: invitados.sector,
      rubro: rubros.nombre,
      premiado: invitados.premiado,
      confirmacion: invitados.confirmacion,
      checkinEn: invitados.checkinEn,
    })
    .from(invitados)
    .leftJoin(rubros, eq(rubros.id, invitados.rubroId))
    .where(and(eq(invitados.id, invitadoId), eq(invitados.eventoId, eventoId)));
  return fila as InvitadoCheckin | undefined;
}

/**
 * Registra el ingreso de un invitado.
 * - Idempotente: el mismo pedido reintentado (misma clave) devuelve el resultado original.
 * - Doble ingreso: si ya ingresó, no lo sobreescribe salvo que se pida corregir explícitamente.
 * - La hora la pone el servidor, no el dispositivo (los relojes de los celulares no coinciden).
 */
export async function registrarCheckin(
  db: Db,
  eventoId: number,
  pedido: PedidoCheckin,
  operador: { usuarioId: number; dispositivo?: string | null },
  ahora = new Date(),
): Promise<ResultadoCheckin> {
  return db.transaction(async (tx) => {
    // Bloquea la fila del invitado: dos celulares registrando a la misma persona se ordenan acá.
    const [bloqueado] = await tx
      .select({ id: invitados.id })
      .from(invitados)
      .where(and(eq(invitados.id, pedido.invitadoId), eq(invitados.eventoId, eventoId)))
      .for("update");
    if (!bloqueado) return { estado: "no_encontrado" };

    const [previo] = await tx
      .select({ invitadoId: checkins.invitadoId, horaAnterior: checkins.horaAnterior })
      .from(checkins)
      .where(eq(checkins.claveIdempotencia, pedido.clave));
    if (previo) {
      if (previo.invitadoId !== pedido.invitadoId) return { estado: "no_encontrado" };
      const invitado = (await invitadoParaCheckin(tx, eventoId, pedido.invitadoId))!;
      return { estado: "registrado", invitado, horaAnterior: previo.horaAnterior, reintento: true };
    }

    const actual = (await invitadoParaCheckin(tx, eventoId, pedido.invitadoId))!;
    if (actual.checkinEn && !pedido.corregir) return { estado: "ya_ingresado", invitado: actual };

    await tx.insert(checkins).values({
      eventoId,
      invitadoId: pedido.invitadoId,
      registradoEn: ahora,
      tipo: actual.checkinEn ? "correccion" : "ingreso",
      horaAnterior: actual.checkinEn,
      usuarioId: operador.usuarioId,
      dispositivo: operador.dispositivo?.slice(0, 200) ?? null,
      claveIdempotencia: pedido.clave,
    });
    // updated_at no cambia por un check-in: refleja ediciones de datos, no ingresos.
    await tx
      .update(invitados)
      .set({ checkinEn: ahora, actualizadoEn: sql`${invitados.actualizadoEn}` })
      .where(eq(invitados.id, pedido.invitadoId));

    return {
      estado: "registrado",
      invitado: { ...actual, checkinEn: ahora },
      horaAnterior: actual.checkinEn,
      reintento: false,
    };
  });
}
