import { autorizarApi } from "@/lib/auth/dal";
import { buscarEvento } from "@/lib/eventos/buscar";
import { leerJson, respuestaError, respuestaErrorInterno, respuestaValidacion } from "@/lib/http";
import { DatosInvitadoError, edicionInvitadoSchema, editarInvitado, obtenerInvitado } from "@/lib/invitados/gestion";
import { z } from "@/lib/zod";

type Ctx = RouteContext<"/api/eventos/[eventoId]/invitados/[invitadoId]">;
const idInvitado = z.coerce.number().int().positive();

/** GET /api/eventos/:id/invitados/:invitadoId — ficha con el historial de ingresos. */
export async function GET(request: Request, ctx: Ctx) {
  const sesion = await autorizarApi(request, "invitados:ver");
  if (sesion instanceof Response) return sesion;
  const { eventoId, invitadoId } = await ctx.params;
  const id = idInvitado.safeParse(invitadoId);
  if (!id.success) return respuestaError(404, "Invitado no encontrado.");

  try {
    const encontrado = await buscarEvento(eventoId);
    if (!encontrado) return respuestaError(404, "Evento no encontrado.");
    const invitado = await obtenerInvitado(encontrado.db, encontrado.evento.id, id.data);
    return invitado ? Response.json(invitado) : respuestaError(404, "Invitado no encontrado.");
  } catch (error) {
    return respuestaErrorInterno("GET /api/eventos/:id/invitados/:invitadoId", error);
  }
}

/**
 * PATCH /api/eventos/:id/invitados/:invitadoId — { confirmacion?, sector?, premiado?, cargo?, rubroId? }
 * Cambia solo lo enviado. La hora de ingreso no se puede editar (solo la registra el check-in).
 */
export async function PATCH(request: Request, ctx: Ctx) {
  const sesion = await autorizarApi(request, "invitados:editar");
  if (sesion instanceof Response) return sesion;
  const { eventoId, invitadoId } = await ctx.params;
  const id = idInvitado.safeParse(invitadoId);
  if (!id.success) return respuestaError(404, "Invitado no encontrado.");
  const cuerpo = await leerJson(request);
  if (cuerpo instanceof Response) return cuerpo;
  const cambios = edicionInvitadoSchema.safeParse(cuerpo);
  if (!cambios.success) return respuestaValidacion(cambios.error);

  try {
    const encontrado = await buscarEvento(eventoId);
    if (!encontrado) return respuestaError(404, "Evento no encontrado.");
    const editado = await editarInvitado(encontrado.db, encontrado.evento, id.data, cambios.data);
    if (!editado) return respuestaError(404, "Invitado no encontrado.");
    return Response.json(await obtenerInvitado(encontrado.db, encontrado.evento.id, editado.id));
  } catch (error) {
    if (error instanceof DatosInvitadoError) return respuestaError(400, error.message, [{ campo: error.campo, mensaje: error.message }]);
    return respuestaErrorInterno("PATCH /api/eventos/:id/invitados/:invitadoId", error);
  }
}

/** El documento pide PUT: se acepta igual, con la misma semántica (solo cambia lo enviado). */
export const PUT = PATCH;
