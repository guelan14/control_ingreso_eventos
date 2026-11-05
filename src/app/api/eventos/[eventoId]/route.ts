import { autorizarApi } from "@/lib/auth/dal";
import { buscarEvento } from "@/lib/eventos/buscar";
import { respuestaError, respuestaErrorInterno } from "@/lib/http";

/** GET /api/eventos/:id — el evento con sus rubros. */
export async function GET(request: Request, ctx: RouteContext<"/api/eventos/[eventoId]">) {
  const sesion = await autorizarApi(request, "eventos:ver");
  if (sesion instanceof Response) return sesion;
  try {
    const encontrado = await buscarEvento((await ctx.params).eventoId);
    if (!encontrado) return respuestaError(404, "Evento no encontrado.");
    return Response.json(encontrado.evento);
  } catch (error) {
    return respuestaErrorInterno("GET /api/eventos/:id", error);
  }
}
