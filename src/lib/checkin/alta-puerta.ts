import { and, eq, isNull, or } from "drizzle-orm";
import type { Db } from "@/db/create-db";
import { checkins, invitados } from "@/db/schema";
import { dniOpcional, esViolacionUnica, InvitadoDuplicadoError, textoOpcional, textoRequerido } from "@/lib/invitados/gestion";
import { claveInvitado } from "@/lib/invitados/normalizar";
import { z } from "@/lib/zod";
import { invitadoParaCheckin, type InvitadoCheckin } from "./registrar";

/** En la puerta la empresa puede no saberse; el campo es obligatorio en la tabla. */
export const EMPRESA_NO_INDICADA = "(no indicada)";

/** D6: alta rápida de quien llega sin estar en la lista, sobre todo acompañantes de premiados. */
export const altaPuertaSchema = z
  .object({
    nombreApellido: textoRequerido(3, 150),
    acompanaA: textoRequerido(2, 150),
    empresa: textoOpcional(150),
    dni: dniOpcional,
    clave: z.string().regex(/^[A-Za-z0-9-]{16,64}$/, "Clave de idempotencia inválida."),
  })
  .strict();
export type AltaPuerta = z.output<typeof altaPuertaSchema>;

export type ResultadoAltaPuerta =
  | { estado: "registrado"; invitado: InvitadoCheckin; reintento: boolean }
  /** Ya estaba cargado (en la lista o dado de alta antes): se muestra su tarjeta en vez de duplicarlo. */
  | { estado: "existe"; invitado: InvitadoCheckin };

/**
 * Da de alta al invitado y registra su ingreso en una sola transacción: o quedan las dos cosas o
 * ninguna. Suma a los ingresados del panel, pero no a confirmados ni a invitaciones enviadas (D7).
 */
export async function registrarAltaEnPuerta(
  db: Db,
  eventoId: number,
  datos: AltaPuerta,
  operador: { usuarioId: number; dispositivo?: string | null },
  ahora = new Date(),
): Promise<ResultadoAltaPuerta> {
  const empresa = datos.empresa ?? EMPRESA_NO_INDICADA;
  const claveNombre = claveInvitado(datos.nombreApellido, empresa);

  try {
    return await db.transaction(async (tx) => {
      // Reintento de red del mismo toque: devolver lo ya hecho.
      const [previo] = await tx
        .select({ invitadoId: checkins.invitadoId })
        .from(checkins)
        .where(eq(checkins.claveIdempotencia, datos.clave));
      if (previo) {
        return { estado: "registrado", invitado: (await invitadoParaCheckin(tx, eventoId, previo.invitadoId))!, reintento: true };
      }

      // ¿Ya está? Por DNI, o por nombre + empresa sin DNI (misma regla que en el resto del sistema).
      const [existente] = await tx
        .select({ id: invitados.id })
        .from(invitados)
        .where(
          and(
            eq(invitados.eventoId, eventoId),
            datos.dni
              ? or(eq(invitados.dni, datos.dni), and(eq(invitados.claveNombre, claveNombre), isNull(invitados.dni)))
              : eq(invitados.claveNombre, claveNombre),
          ),
        )
        .limit(1);
      if (existente) return { estado: "existe", invitado: (await invitadoParaCheckin(tx, eventoId, existente.id))! };

      const [creado] = await tx
        .insert(invitados)
        .values({
          eventoId,
          nombreApellido: datos.nombreApellido,
          empresa,
          dni: datos.dni ?? null,
          confirmacion: "Confirmado",
          premiado: false,
          origen: "puerta",
          acompanaA: datos.acompanaA,
          claveNombre,
          checkinEn: ahora,
        })
        .returning({ id: invitados.id });

      await tx.insert(checkins).values({
        eventoId,
        invitadoId: creado.id,
        registradoEn: ahora,
        tipo: "ingreso",
        usuarioId: operador.usuarioId,
        dispositivo: operador.dispositivo?.slice(0, 200) ?? null,
        claveIdempotencia: datos.clave,
      });

      return { estado: "registrado", invitado: (await invitadoParaCheckin(tx, eventoId, creado.id))!, reintento: false };
    });
  } catch (error) {
    if (esViolacionUnica(error)) throw new InvitadoDuplicadoError("Esa persona ya está cargada en el evento.");
    throw error;
  }
}
