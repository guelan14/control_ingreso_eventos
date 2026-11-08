import { autorizarApi } from "@/lib/auth/dal";
import { pedidoCheckinSchema, registrarCheckin } from "@/lib/checkin/registrar";
import { buscarEvento } from "@/lib/eventos/buscar";
import { leerJson, respuestaError, respuestaErrorInterno, respuestaValidacion } from "@/lib/http";

/**
 * POST /api/eventos/:id/checkin — { invitadoId, clave, corregir? }
 *   201  ingreso registrado
 *   200  reintento de un pedido ya registrado (misma clave): mismo resultado, sin duplicar
 *   409  ya había ingresado; devuelve la hora anterior. Para reemplazarla: corregir=true
 */
export async function POST(request: Request, ctx: RouteContext<"/api/eventos/[eventoId]/checkin">) {
  const sesion = await autorizarApi(request, "checkin:registrar");
  if (sesion instanceof Response) return sesion;
  const cuerpo = await leerJson(request);
  if (cuerpo instanceof Response) return cuerpo;
  const pedido = pedidoCheckinSchema.safeParse(cuerpo);
  if (!pedido.success) return respuestaValidacion(pedido.error);

  try {
    const encontrado = await buscarEvento((await ctx.params).eventoId);
    if (!encontrado) return respuestaError(404, "Evento no encontrado.");

    const resultado = await registrarCheckin(encontrado.db, encontrado.evento.id, pedido.data, {
      usuarioId: sesion.usuarioId,
      dispositivo: request.headers.get("user-agent"),
    });
    switch (resultado.estado) {
      case "no_encontrado":
        return respuestaError(404, "El invitado no pertenece a este evento.");
      case "ya_ingresado":
        return Response.json(resultado, { status: 409 });
      case "registrado":
        return Response.json(resultado, { status: resultado.reintento ? 200 : 201 });
    }
  } catch (error) {
    return respuestaErrorInterno("POST /api/eventos/:id/checkin", error);
  }
}
