import { getDb } from "@/db/client";
import { crearEvento, listarEventos, nuevoEventoSchema } from "@/lib/eventos/eventos";
import { leerJson, respuestaErrorInterno, respuestaValidacion } from "@/lib/http";

/** GET /api/eventos — todos los eventos, el más reciente primero. */
export async function GET() {
  try {
    return Response.json({ data: await listarEventos(await getDb()) });
  } catch (error) {
    return respuestaErrorInterno("GET /api/eventos", error);
  }
}

/** POST /api/eventos — { nombre, fecha, usaRubros, usaPremiados, rubros[] } */
export async function POST(request: Request) {
  const cuerpo = await leerJson(request);
  if (cuerpo instanceof Response) return cuerpo;
  const datos = nuevoEventoSchema.safeParse(cuerpo);
  if (!datos.success) return respuestaValidacion(datos.error);

  try {
    const evento = await crearEvento(await getDb(), datos.data);
    return Response.json(evento, { status: 201 });
  } catch (error) {
    return respuestaErrorInterno("POST /api/eventos", error);
  }
}
