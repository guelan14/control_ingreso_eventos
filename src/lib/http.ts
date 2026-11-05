import "server-only";
import type { ZodError } from "zod";

/** Formato único de error de la API: { error: { mensaje, detalles? } } */
export function respuestaError(status: number, mensaje: string, detalles?: unknown) {
  return Response.json({ error: { mensaje, detalles } }, { status });
}

export function respuestaValidacion(error: ZodError) {
  return respuestaError(
    400,
    "Parámetros inválidos.",
    error.issues.map((i) => ({ campo: i.path.join("."), mensaje: i.message })),
  );
}

/** Cuerpo JSON del request, o una respuesta 400 lista para devolver si no es JSON válido. */
export async function leerJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return respuestaError(400, "El cuerpo debe ser JSON válido.");
  }
}

/** Errores no previstos: se loguean completos en el servidor, al cliente va un mensaje genérico. */
export function respuestaErrorInterno(contexto: string, error: unknown) {
  console.error(`[${contexto}]`, error);
  return respuestaError(500, "Error interno del servidor. Intente nuevamente.");
}
