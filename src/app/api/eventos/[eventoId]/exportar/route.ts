import type { NextRequest } from "next/server";
import { autorizarApi } from "@/lib/auth/dal";
import { nombreSeguro, respuestaArchivo, TIPO_XLSX } from "@/lib/descargas";
import { buscarEvento } from "@/lib/eventos/buscar";
import { exportarInvitados, LISTAS_EXPORTABLES } from "@/lib/exportar/exportar";
import { respuestaError, respuestaErrorInterno, respuestaValidacion } from "@/lib/http";
import { z } from "@/lib/zod";

const consultaSchema = z.object({ lista: z.enum(LISTAS_EXPORTABLES).default("presentes") });

/** GET /api/eventos/:id/exportar?lista=presentes|todos — Excel. Solo organizadores (D11). */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/eventos/[eventoId]/exportar">) {
  const sesion = await autorizarApi(request, "datos:exportar");
  if (sesion instanceof Response) return sesion;
  const consulta = consultaSchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!consulta.success) return respuestaValidacion(consulta.error);

  try {
    const encontrado = await buscarEvento((await ctx.params).eventoId);
    if (!encontrado) return respuestaError(404, "Evento no encontrado.");
    const { db, evento } = encontrado;
    const { lista } = consulta.data;
    const archivo = await exportarInvitados(db, evento, lista);
    return respuestaArchivo(archivo, TIPO_XLSX, `${nombreSeguro(evento.nombre)} - ${lista}.xlsx`);
  } catch (error) {
    return respuestaErrorInterno("GET /api/eventos/:id/exportar", error);
  }
}
