import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getDb } from "@/db/client";
import { respuestaError } from "@/lib/http";
import { COOKIE_SESION } from "./cookie";
import { puede, type Permiso } from "./roles";
import { cerrarSesion, crearSesion, validarSesion, type Sesion } from "./sesiones";

/**
 * Capa de acceso: toda pantalla, endpoint y Server Action pasa por acá. El proxy solo mira
 * si hay cookie (control rápido); la validación real contra la base se hace en estas funciones.
 */

// En la red local del respaldo se entra por http://, donde una cookie Secure no se guarda.
const cookieSegura = process.env.COOKIE_SECURE
  ? process.env.COOKIE_SECURE === "true"
  : process.env.NODE_ENV === "production";

/** Sesión del request actual (una sola consulta por request gracias a cache). */
export const obtenerSesion = cache(async (): Promise<Sesion | null> => {
  const token = (await cookies()).get(COOKIE_SESION)?.value;
  if (!token) return null;
  return validarSesion(await getDb(), token);
});

/** Para páginas: redirige al login, al cambio de contraseña o a "sin permiso" según corresponda. */
export async function requerirSesion(permiso?: Permiso, { cambioDeClave = false } = {}): Promise<Sesion> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");
  if (sesion.debeCambiarClave && !cambioDeClave) redirect("/cambiar-clave");
  if (permiso && !puede(sesion.rol, permiso)) redirect("/sin-permiso");
  return sesion;
}

/** Para Server Actions: lanza error en vez de redirigir (son endpoints públicos, se revalida todo). */
export async function autorizarAccion(permiso: Permiso): Promise<Sesion> {
  const sesion = await obtenerSesion();
  if (!sesion || sesion.debeCambiarClave || !puede(sesion.rol, permiso)) {
    throw new Error("No autorizado.");
  }
  return sesion;
}

function mismoOrigen(request: Request) {
  const origen = request.headers.get("origin");
  if (!origen) return true; // Clientes que no son navegadores no mandan Origin.
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return new URL(origen).host === host;
  } catch {
    return false;
  }
}

/**
 * Para endpoints de la API: la sesión, o una respuesta 401/403 lista para devolver.
 * En métodos que modifican datos también controla que el pedido venga de esta misma app (CSRF).
 */
export async function autorizarApi(request: Request, permiso: Permiso): Promise<Sesion | Response> {
  if (!["GET", "HEAD"].includes(request.method) && !mismoOrigen(request)) {
    return respuestaError(403, "Origen no permitido.");
  }
  const sesion = await obtenerSesion();
  if (!sesion) return respuestaError(401, "Inicie sesión para continuar.");
  if (sesion.debeCambiarClave) return respuestaError(403, "Debe cambiar su contraseña antes de continuar.");
  if (!puede(sesion.rol, permiso)) return respuestaError(403, "No tiene permiso para esta acción.");
  return sesion;
}

export async function abrirSesion(usuarioId: number) {
  const { token, expiraEn } = await crearSesion(await getDb(), usuarioId);
  (await cookies()).set(COOKIE_SESION, token, {
    httpOnly: true,
    secure: cookieSegura,
    sameSite: "lax",
    path: "/",
    expires: expiraEn,
  });
}

export async function tokenActual() {
  return (await cookies()).get(COOKIE_SESION)?.value;
}

export async function cerrarSesionActual() {
  const almacen = await cookies();
  const token = almacen.get(COOKIE_SESION)?.value;
  if (token) await cerrarSesion(await getDb(), token);
  almacen.delete(COOKIE_SESION);
}
