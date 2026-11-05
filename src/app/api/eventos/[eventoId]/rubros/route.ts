import { agregarRubro, nuevoRubroSchema, RubroDuplicadoError } from "@/lib/eventos/eventos";
import { buscarEvento } from "@/lib/eventos/buscar";
import { leerJson, respuestaError, respuestaErrorInterno, respuestaValidacion } from "@/lib/http";

/** POST /api/eventos/:id/rubros — { nombre } */
export async function POST(request: Request, ctx: RouteContext<"/api/eventos/[eventoId]/rubros">) {
  const cuerpo = await leerJson(request);
  if (cuerpo instanceof Response) return cuerpo;
  const datos = nuevoRubroSchema.safeParse(cuerpo);
  if (!datos.success) return respuestaValidacion(datos.error);

  try {
    const encontrado = await buscarEvento((await ctx.params).eventoId);
    if (!encontrado) return respuestaError(404, "Evento no encontrado.");
    if (!encontrado.evento.usaRubros) return respuestaError(409, "Este evento no usa rubros.");
    const rubro = await agregarRubro(encontrado.db, encontrado.evento.id, datos.data.nombre);
    return Response.json(rubro, { status: 201 });
  } catch (error) {
    if (error instanceof RubroDuplicadoError) return respuestaError(409, error.message);
    return respuestaErrorInterno("POST /api/eventos/:id/rubros", error);
  }
}
