import { autorizarApi } from "@/lib/auth/dal";
import { buscarEvento } from "@/lib/eventos/buscar";
import { respuestaError, respuestaErrorInterno } from "@/lib/http";
import { obtenerPanel } from "@/lib/panel/panel";

/** GET /api/eventos/:id/panel — métricas, premiados pendientes, desglose por rubro y últimos ingresos. */
export async function GET(request: Request, ctx: RouteContext<"/api/eventos/[eventoId]/panel">) {
  const sesion = await autorizarApi(request, "panel:ver");
  if (sesion instanceof Response) return sesion;
  try {
    const encontrado = await buscarEvento((await ctx.params).eventoId);
    if (!encontrado) return respuestaError(404, "Evento no encontrado.");
    return Response.json(await obtenerPanel(encontrado.db, encontrado.evento), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return respuestaErrorInterno("GET /api/eventos/:id/panel", error);
  }
}
