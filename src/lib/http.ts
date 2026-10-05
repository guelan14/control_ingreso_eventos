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

/** Errores no previstos: se loguean completos en el servidor, al cliente va un mensaje genérico. */
export function respuestaErrorInterno(contexto: string, error: unknown) {
  console.error(`[${contexto}]`, error);
  return respuestaError(500, "Error interno del servidor. Intente nuevamente.");
}
