import { and, asc, desc, eq, isNotNull } from "drizzle-orm";
import type { Db } from "@/db/create-db";
import { checkins, invitados, rubros, usuarios } from "@/db/schema";
import type { EventoConRubros } from "@/lib/eventos/eventos";
import { z } from "@/lib/zod";
import { CONFIRMACION_VALORES } from "./constants";
import { claveInvitado, limpiarTexto, normalizarDni } from "./normalizar";

/**
 * Alta manual y edición de invitados (Módulo 3). Reglas del documento:
 * - No hay borrado: si hace falta, se reimporta el Excel.
 * - La hora de ingreso no se edita acá: solo la registra el check-in.
 */

export const textoRequerido = (min: number, max: number) =>
  z
    .string()
    .max(max)
    .transform((v) => limpiarTexto(v) ?? "")
    .pipe(z.string().min(min));

/** undefined = no tocar; "" o null = borrar el dato. */
export const textoOpcional = (max: number) =>
  z
    .string()
    .max(max)
    .nullish()
    .transform((v) => (v === undefined ? undefined : limpiarTexto(v)));

export const dniOpcional = z
  .string()
  .max(30)
  .nullish()
  .transform((v, ctx) => {
    if (v === undefined) return undefined;
    const limpio = limpiarTexto(v);
    if (!limpio) return null;
    const dni = normalizarDni(limpio);
    if (!/^[0-9A-Z]{4,20}$/.test(dni)) {
      ctx.addIssue({ code: "custom", message: "DNI no válido: solo números o letras (se aceptan puntos y espacios)." });
      return z.NEVER;
    }
    return dni;
  });

const rubroId = z.number().int().positive().nullish();

export const nuevoInvitadoSchema = z
  .object({
    nombreApellido: textoRequerido(3, 150),
    empresa: textoRequerido(2, 150),
    cargo: textoOpcional(150),
    dni: dniOpcional,
    sector: textoOpcional(50),
    confirmacion: z.enum(CONFIRMACION_VALORES),
    premiado: z.boolean().default(false),
    rubroId,
  })
  .strict();
export type NuevoInvitado = z.output<typeof nuevoInvitadoSchema>;

/** Campos editables. `.strict()`: mandar checkinEn (u otro campo) es un error, no se ignora. */
export const edicionInvitadoSchema = z
  .object({
    confirmacion: z.enum(CONFIRMACION_VALORES).optional(),
    sector: textoOpcional(50),
    premiado: z.boolean().optional(),
    cargo: textoOpcional(150),
    rubroId,
  })
  .strict();
/** Cualquier subconjunto de los campos editables: lo que no viene, no se toca. */
export type EdicionInvitado = Partial<z.output<typeof edicionInvitadoSchema>>;

/** Datos válidos en sí, pero no para este evento (rubro de otro evento, premiado en una charla…). */
export class DatosInvitadoError extends Error {
  constructor(
    readonly campo: string,
    mensaje: string,
  ) {
    super(mensaje);
  }
}

export class InvitadoDuplicadoError extends Error {}

function validarSegunEvento(
  evento: EventoConRubros,
  datos: { rubroId?: number | null; premiado?: boolean },
  { esAlta }: { esAlta: boolean },
) {
  if (evento.usaRubros) {
    if (esAlta && !datos.rubroId) throw new DatosInvitadoError("rubroId", "Elija un rubro.");
    if (datos.rubroId === null) throw new DatosInvitadoError("rubroId", "Este evento usa rubros: el rubro es obligatorio.");
    if (datos.rubroId && !evento.rubros.some((r) => r.id === datos.rubroId)) {
      throw new DatosInvitadoError("rubroId", "Ese rubro no pertenece a este evento.");
    }
  } else if (datos.rubroId) {
    throw new DatosInvitadoError("rubroId", "Este evento no usa rubros.");
  }
  if (!evento.usaPremiados && datos.premiado) {
    throw new DatosInvitadoError("premiado", "Este evento no usa premiados.");
  }
}

export function esViolacionUnica(error: unknown): boolean {
  const e = error as { code?: string; cause?: { code?: string } };
  return e?.code === "23505" || e?.cause?.code === "23505";
}

/** Misma regla que la importación: homónimos (nombre + empresa) solo si los dos tienen DNI. */
async function asegurarNoDuplicado(db: Db, eventoId: number, datos: NuevoInvitado, clave: string) {
  if (datos.dni) {
    const [conDni] = await db
      .select({ nombre: invitados.nombreApellido })
      .from(invitados)
      .where(and(eq(invitados.eventoId, eventoId), eq(invitados.dni, datos.dni)));
    if (conDni) throw new InvitadoDuplicadoError(`Ya hay un invitado con DNI ${datos.dni}: ${conDni.nombre}.`);
  }
  const homonimos = await db
    .select({ dni: invitados.dni })
    .from(invitados)
    .where(and(eq(invitados.eventoId, eventoId), eq(invitados.claveNombre, clave)));
  if (homonimos.some((h) => !h.dni || !datos.dni)) {
    throw new InvitadoDuplicadoError(
      `"${datos.nombreApellido}" de "${datos.empresa}" ya está en la lista. Si es otra persona, cargue el DNI de los dos.`,
    );
  }
}

export async function crearInvitado(db: Db, evento: EventoConRubros, datos: NuevoInvitado) {
  validarSegunEvento(evento, datos, { esAlta: true });
  const clave = claveInvitado(datos.nombreApellido, datos.empresa);
  await asegurarNoDuplicado(db, evento.id, datos, clave);

  try {
    const [creado] = await db
      .insert(invitados)
      .values({
        eventoId: evento.id,
        nombreApellido: datos.nombreApellido,
        empresa: datos.empresa,
        cargo: datos.cargo ?? null,
        dni: datos.dni ?? null,
        sector: datos.sector ?? null,
        confirmacion: datos.confirmacion,
        premiado: evento.usaPremiados ? datos.premiado : false,
        rubroId: evento.usaRubros ? (datos.rubroId ?? null) : null,
        claveNombre: clave,
      })
      .returning({ id: invitados.id });
    return creado;
  } catch (error) {
    // Dos altas iguales al mismo tiempo: la segunda la frena el índice único.
    if (esViolacionUnica(error)) throw new InvitadoDuplicadoError("Ese invitado ya está en la lista.");
    throw error;
  }
}

/** Cambia solo los campos enviados; el resto (y la hora de ingreso) queda como estaba. */
export async function editarInvitado(db: Db, evento: EventoConRubros, invitadoId: number, cambios: EdicionInvitado) {
  validarSegunEvento(evento, cambios, { esAlta: false });
  const valores = Object.fromEntries(Object.entries(cambios).filter(([, v]) => v !== undefined));
  const delEvento = and(eq(invitados.id, invitadoId), eq(invitados.eventoId, evento.id));

  if (Object.keys(valores).length === 0) {
    const [actual] = await db.select({ id: invitados.id }).from(invitados).where(delEvento);
    return actual ?? null;
  }
  const [editado] = await db.update(invitados).set(valores).where(delEvento).returning({ id: invitados.id });
  return editado ?? null;
}

/** Ficha del invitado con el historial de ingresos (quién y cuándo). */
export async function obtenerInvitado(db: Db, eventoId: number, invitadoId: number) {
  const [invitado] = await db
    .select({
      id: invitados.id,
      nombreApellido: invitados.nombreApellido,
      empresa: invitados.empresa,
      cargo: invitados.cargo,
      dni: invitados.dni,
      rubroId: invitados.rubroId,
      rubro: rubros.nombre,
      confirmacion: invitados.confirmacion,
      premiado: invitados.premiado,
      sector: invitados.sector,
      checkinEn: invitados.checkinEn,
      origen: invitados.origen,
      acompanaA: invitados.acompanaA,
      codigo: invitados.codigo,
      creadoEn: invitados.creadoEn,
      actualizadoEn: invitados.actualizadoEn,
    })
    .from(invitados)
    .leftJoin(rubros, eq(rubros.id, invitados.rubroId))
    .where(and(eq(invitados.id, invitadoId), eq(invitados.eventoId, eventoId)));
  if (!invitado) return null;

  const historial = await db
    .select({
      id: checkins.id,
      registradoEn: checkins.registradoEn,
      tipo: checkins.tipo,
      horaAnterior: checkins.horaAnterior,
      operador: usuarios.nombre,
      dispositivo: checkins.dispositivo,
    })
    .from(checkins)
    .leftJoin(usuarios, eq(usuarios.id, checkins.usuarioId))
    .where(eq(checkins.invitadoId, invitadoId))
    .orderBy(desc(checkins.registradoEn), desc(checkins.id));

  return { ...invitado, historial };
}

/** Sectores usados en el evento, para el filtro. */
export async function listarSectores(db: Db, eventoId: number) {
  const filas = await db
    .selectDistinct({ sector: invitados.sector })
    .from(invitados)
    .where(and(eq(invitados.eventoId, eventoId), isNotNull(invitados.sector)))
    .orderBy(asc(invitados.sector));
  return filas.map((f) => f.sector!);
}
