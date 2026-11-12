import { and, eq } from "drizzle-orm";
import { invitados } from "@/db/schema";
import { autorizarApi } from "@/lib/auth/dal";
import { nombreSeguro, respuestaArchivo } from "@/lib/descargas";
import { buscarEvento } from "@/lib/eventos/buscar";
import { respuestaError, respuestaErrorInterno } from "@/lib/http";
import { qrPng } from "@/lib/qr/qr";

/** GET /api/eventos/:id/invitados/:invitadoId/qr — PNG del QR de un invitado. */
export async function GET(request: Request, ctx: RouteContext<"/api/eventos/[eventoId]/invitados/[invitadoId]/qr">) {
  const sesion = await autorizarApi(request, "qr:generar");
  if (sesion instanceof Response) return sesion;
  const { eventoId, invitadoId } = await ctx.params;
  const id = Number(invitadoId);
  if (!Number.isInteger(id) || id <= 0) return respuestaError(404, "Invitado no encontrado.");

  try {
    const encontrado = await buscarEvento(eventoId);
    if (!encontrado) return respuestaError(404, "Evento no encontrado.");
    const [inv] = await encontrado.db
      .select({ nombre: invitados.nombreApellido, codigo: invitados.codigo })
      .from(invitados)
      .where(and(eq(invitados.id, id), eq(invitados.eventoId, encontrado.evento.id)));
    if (!inv) return respuestaError(404, "Invitado no encontrado.");
    const png = await qrPng(inv.codigo);
    return respuestaArchivo(new Uint8Array(png), "image/png", `QR - ${nombreSeguro(inv.nombre)}.png`);
  } catch (error) {
    return respuestaErrorInterno("GET /api/eventos/:id/invitados/:invitadoId/qr", error);
  }
}
