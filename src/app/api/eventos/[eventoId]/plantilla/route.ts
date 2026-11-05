import { buscarEvento } from "@/lib/eventos/buscar";
import { respuestaError, respuestaErrorInterno } from "@/lib/http";
import { crearLibroInvitados } from "@/lib/importacion/plantilla";

/** GET /api/eventos/:id/plantilla — Excel vacío con las columnas y rubros de este evento. */
export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/eventos/[eventoId]/plantilla">,
) {
  try {
    const encontrado = await buscarEvento((await ctx.params).eventoId);
    if (!encontrado) return respuestaError(404, "Evento no encontrado.");
    const { evento } = encontrado;

    const libro = await crearLibroInvitados([], {
      usaRubros: evento.usaRubros,
      usaPremiados: evento.usaPremiados,
      rubros: evento.rubros.map((r) => r.nombre),
    });
    return new Response(libro, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="plantilla_evento_${evento.id}.xlsx"`,
      },
    });
  } catch (error) {
    return respuestaErrorInterno("GET /api/eventos/:id/plantilla", error);
  }
}
