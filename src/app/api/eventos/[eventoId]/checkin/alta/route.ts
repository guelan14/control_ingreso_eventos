import { autorizarApi } from "@/lib/auth/dal";
import { altaPuertaSchema, registrarAltaEnPuerta } from "@/lib/checkin/alta-puerta";
import { buscarEvento } from "@/lib/eventos/buscar";
import { leerJson, respuestaError, respuestaErrorInterno, respuestaValidacion } from "@/lib/http";
import { InvitadoDuplicadoError } from "@/lib/invitados/gestion";

/**
 * POST /api/eventos/:id/checkin/alta — quien llega sin estar en la lista (D6).
 *   { nombreApellido, acompanaA, empresa?, dni?, clave }
 *   201  dado de alta con el ingreso registrado
 *   200  reintento de un pedido ya registrado (misma clave)
 *   409  ya estaba cargado: devuelve sus datos para registrarlo por la vía normal
 */
export async function POST(request: Request, ctx: RouteContext<"/api/eventos/[eventoId]/checkin/alta">) {
  const sesion = await autorizarApi(request, "checkin:registrar");
  if (sesion instanceof Response) return sesion;
  const cuerpo = await leerJson(request);
  if (cuerpo instanceof Response) return cuerpo;
  const datos = altaPuertaSchema.safeParse(cuerpo);
  if (!datos.success) return respuestaValidacion(datos.error);

  try {
    const encontrado = await buscarEvento((await ctx.params).eventoId);
    if (!encontrado) return respuestaError(404, "Evento no encontrado.");
    const r = await registrarAltaEnPuerta(encontrado.db, encontrado.evento.id, datos.data, {
      usuarioId: sesion.usuarioId,
      dispositivo: request.headers.get("user-agent"),
    });
    if (r.estado === "existe") return Response.json(r, { status: 409 });
    return Response.json(r, { status: r.reintento ? 200 : 201 });
  } catch (error) {
    if (error instanceof InvitadoDuplicadoError) return respuestaError(409, error.message);
    return respuestaErrorInterno("POST /api/eventos/:id/checkin/alta", error);
  }
}
