import { asc, desc, eq } from "drizzle-orm";
import type { Db, Ejecutor } from "@/db/create-db";
import { eventos, rubros } from "@/db/schema";
import { limpiarTexto, normalizarComparacion } from "@/lib/invitados/normalizar";
import { z } from "@/lib/zod";

const nombreRubro = z.string().trim().min(1, "El rubro no puede estar vacío.").max(80);

export const nuevoEventoSchema = z.object({
  nombre: z.string().trim().min(3, "Mínimo 3 caracteres.").max(150),
  fecha: z.iso.date("Fecha inválida (formato AAAA-MM-DD)."),
  usaRubros: z.boolean(),
  usaPremiados: z.boolean(),
  rubros: z.array(nombreRubro).max(100).default([]),
});

export type NuevoEvento = z.input<typeof nuevoEventoSchema>;

export class RubroDuplicadoError extends Error {}

/** Quita duplicados ignorando mayúsculas y tildes ("Comercio" = "comercio"), conserva el primero. */
function sinRubrosRepetidos(nombres: string[]) {
  const vistos = new Map<string, string>();
  for (const n of nombres) {
    const limpio = limpiarTexto(n);
    if (limpio && !vistos.has(normalizarComparacion(limpio))) {
      vistos.set(normalizarComparacion(limpio), limpio);
    }
  }
  return [...vistos.values()];
}

export async function crearEvento(db: Db, datos: z.output<typeof nuevoEventoSchema>) {
  return db.transaction(async (tx) => {
    const [evento] = await tx
      .insert(eventos)
      .values({
        nombre: datos.nombre,
        fecha: datos.fecha,
        usaRubros: datos.usaRubros,
        usaPremiados: datos.usaPremiados,
      })
      .returning();

    const nombres = datos.usaRubros ? sinRubrosRepetidos(datos.rubros) : [];
    if (nombres.length > 0) {
      await tx.insert(rubros).values(nombres.map((nombre) => ({ eventoId: evento.id, nombre })));
    }
    return evento;
  });
}

export function listarEventos(db: Db) {
  return db.select().from(eventos).orderBy(desc(eventos.fecha), desc(eventos.id));
}

export async function obtenerEvento(db: Ejecutor, id: number) {
  const [evento] = await db.select().from(eventos).where(eq(eventos.id, id));
  if (!evento) return null;
  const listaRubros = await db
    .select({ id: rubros.id, nombre: rubros.nombre })
    .from(rubros)
    .where(eq(rubros.eventoId, id))
    .orderBy(asc(rubros.nombre));
  return { ...evento, rubros: listaRubros };
}

export type EventoConRubros = NonNullable<Awaited<ReturnType<typeof obtenerEvento>>>;

export const nuevoRubroSchema = z.object({ nombre: nombreRubro });

export async function agregarRubro(db: Db, eventoId: number, nombre: string) {
  const evento = await obtenerEvento(db, eventoId);
  if (!evento) return null;
  const existente = evento.rubros.find(
    (r) => normalizarComparacion(r.nombre) === normalizarComparacion(nombre),
  );
  if (existente) throw new RubroDuplicadoError(`El rubro "${existente.nombre}" ya existe.`);

  const [rubro] = await db.insert(rubros).values({ eventoId, nombre }).returning();
  return rubro;
}
