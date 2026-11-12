import { autorizarApi } from "@/lib/auth/dal";
import { nombreSeguro, respuestaArchivo } from "@/lib/descargas";
import { buscarEvento } from "@/lib/eventos/buscar";
import { respuestaError, respuestaErrorInterno } from "@/lib/http";
import { zipDeQrs } from "@/lib/qr/qr";

/** GET /api/eventos/:id/qr — ZIP con un PNG por invitado y una planilla índice (D9). */
export async function GET(request: Request, ctx: RouteContext<"/api/eventos/[eventoId]/qr">) {
  const sesion = await autorizarApi(request, "qr:generar");
  if (sesion instanceof Response) return sesion;
  try {
    const encontrado = await buscarEvento((await ctx.params).eventoId);
    if (!encontrado) return respuestaError(404, "Evento no encontrado.");
    const zip = await zipDeQrs(encontrado.db, encontrado.evento);
    return respuestaArchivo(zip as Uint8Array<ArrayBuffer>, "application/zip", `QR - ${nombreSeguro(encontrado.evento.nombre)}.zip`);
  } catch (error) {
    return respuestaErrorInterno("GET /api/eventos/:id/qr", error);
  }
}
