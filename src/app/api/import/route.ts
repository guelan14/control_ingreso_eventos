import { getDb } from "@/db/client";
import { respuestaError, respuestaErrorInterno } from "@/lib/http";
import { importarInvitados } from "@/lib/importacion/importar";
import { ArchivoInvalidoError } from "@/lib/importacion/leer-excel";

const MAX_MB = Number(process.env.IMPORT_MAX_MB ?? 5);

/**
 * POST /api/import  (multipart/form-data)
 *   archivo:   el .xlsx
 *   confirmar: "true" para grabar. Sin él solo valida y devuelve el reporte (previsualización).
 */
export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return respuestaError(400, "Se esperaba un formulario multipart con el campo 'archivo'.");
  }

  const archivo = form.get("archivo");
  if (!(archivo instanceof File)) {
    return respuestaError(400, "Falta el campo 'archivo'.");
  }
  if (!archivo.name.toLowerCase().endsWith(".xlsx")) {
    return respuestaError(400, "El archivo debe tener extensión .xlsx.");
  }
  if (archivo.size > MAX_MB * 1024 * 1024) {
    return respuestaError(413, `El archivo supera el máximo de ${MAX_MB} MB.`);
  }

  const confirmar = form.get("confirmar") === "true";

  try {
    const reporte = await importarInvitados(getDb(), await archivo.arrayBuffer(), { confirmar });
    // 422 solo si se pidió grabar y no se pudo; una previsualización con errores es una respuesta válida.
    const status = confirmar && !reporte.valido ? 422 : 200;
    return Response.json(reporte, { status });
  } catch (error) {
    if (error instanceof ArchivoInvalidoError) return respuestaError(400, error.message);
    return respuestaErrorInterno("POST /api/import", error);
  }
}
