import "server-only";
import { getDb } from "@/db/client";
import { z } from "@/lib/zod";
import { obtenerEvento } from "./eventos";

const idEvento = z.coerce.number().int().positive();

/** Evento a partir del segmento [eventoId] de la URL. null si el id es inválido o no existe. */
export async function buscarEvento(eventoId: string) {
  const id = idEvento.safeParse(eventoId);
  if (!id.success) return null;
  const db = await getDb();
  const evento = await obtenerEvento(db, id.data);
  return evento ? { db, evento } : null;
}
