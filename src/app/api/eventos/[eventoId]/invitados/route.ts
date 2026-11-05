import type { NextRequest } from "next/server";
import { buscarEvento } from "@/lib/eventos/buscar";
import { respuestaError, respuestaErrorInterno, respuestaValidacion } from "@/lib/http";
import { filtrosInvitadosSchema, listarInvitados } from "@/lib/invitados/listar";

/**
 * GET /api/eventos/:id/invitados
 *   ?q=&rubroId=&sector=&confirmacion=&premiado=si|no&checkin=si|no&pagina=1&porPagina=50
 */
export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/api/eventos/[eventoId]/invitados">,
) {
  const filtros = filtrosInvitadosSchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!filtros.success) return respuestaValidacion(filtros.error);

  try {
    const encontrado = await buscarEvento((await ctx.params).eventoId);
    if (!encontrado) return respuestaError(404, "Evento no encontrado.");
    return Response.json(await listarInvitados(encontrado.db, encontrado.evento.id, filtros.data));
  } catch (error) {
    return respuestaErrorInterno("GET /api/eventos/:id/invitados", error);
  }
}
