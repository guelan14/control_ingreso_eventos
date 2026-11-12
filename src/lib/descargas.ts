import "server-only";

export const TIPO_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Respuesta de descarga con nombre de archivo con tildes (RFC 6266) y sin guardar en caché. */
export function respuestaArchivo(contenido: BodyInit, tipo: string, nombre: string) {
  const ascii = nombre.normalize("NFD").replace(/[^\x20-\x7e]/g, "").replace(/["\\]/g, "");
  return new Response(contenido, {
    headers: {
      "Content-Type": tipo,
      "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nombre)}`,
      "Cache-Control": "no-store",
    },
  });
}

/** "Aniversario 2027" -> "Aniversario 2027", sin caracteres que no admiten los sistemas de archivos. */
export function nombreSeguro(texto: string) {
  return texto.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
}
