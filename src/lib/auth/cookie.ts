/** Nombre de la cookie de sesión. Archivo aparte para poder usarlo desde src/proxy.ts. */
export const COOKIE_SESION = "sesion";

/** Destino después del login: solo rutas internas, para no permitir redirecciones a otro sitio. */
export function destinoSeguro(valor: unknown): string {
  if (typeof valor !== "string" || !valor.startsWith("/")) return "/";
  if (valor.startsWith("//") || valor.startsWith("/\\") || valor.startsWith("/login")) return "/";
  return valor;
}
