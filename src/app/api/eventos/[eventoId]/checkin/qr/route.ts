import type { NextRequest } from "next/server";
import { autorizarApi } from "@/lib/auth/dal";
import { buscarEvento } from "@/lib/eventos/buscar";
import { respuestaError, respuestaErrorInterno } from "@/lib/http";
import { buscarPorQr } from "@/lib/qr/qr";

/**
 * GET /api/eventos/:id/checkin/qr?codigo=... — el invitado de un QR escaneado en la puerta.
 *   200 invitado · 404 código desconocido · 409 el QR es de otro evento
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/eventos/[eventoId]/checkin/qr">) {
  const sesion = await autorizarApi(request, "checkin:registrar");
  if (sesion instanceof Response) return sesion;
  const leido = (request.nextUrl.searchParams.get("codigo") ?? "").slice(0, 300);

  try {
    const encontrado = await buscarEvento((await ctx.params).eventoId);
    if (!encontrado) return respuestaError(404, "Evento no encontrado.");
    const r = await buscarPorQr(encontrado.db, encontrado.evento.id, leido);
    switch (r.estado) {
      case "encontrado":
        return Response.json(r.invitado);
      case "otro_evento":
        return respuestaError(409, `Este QR es de otro evento: ${r.evento}.`);
      case "no_encontrado":
        return respuestaError(404, "QR no reconocido: no corresponde a ningún invitado.");
    }
  } catch (error) {
    return respuestaErrorInterno("GET /api/eventos/:id/checkin/qr", error);
  }
}
