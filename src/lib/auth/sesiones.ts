import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, lt, ne, sql } from "drizzle-orm";
import type { Ejecutor } from "@/db/create-db";
import { sesiones, usuarios } from "@/db/schema";
import { hashearClave, verificarClave } from "./clave";
import type { Rol } from "./roles";

/** Una jornada de evento entera sin volver a ingresar. */
export const DURACION_SESION_MS = 12 * 60 * 60 * 1000;
export const MAX_INTENTOS = 5;
export const BLOQUEO_MS = 15 * 60 * 1000;

/** Lo que el resto de la app sabe del usuario conectado (sin el hash ni datos de bloqueo). */
export type Sesion = {
  usuarioId: number;
  usuario: string;
  nombre: string;
  rol: Rol;
  debeCambiarClave: boolean;
};

export type ResultadoLogin =
  | { ok: true; usuarioId: number; debeCambiarClave: boolean }
  | { ok: false; motivo: "credenciales" | "bloqueado" };

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

// Si el usuario no existe se verifica igual contra un hash cualquiera: la respuesta tarda lo
// mismo y no permite averiguar qué usuarios existen midiendo tiempos.
let hashFicticio: Promise<string> | undefined;

export async function autenticar(
  db: Ejecutor,
  usuario: string,
  clave: string,
  ahora = new Date(),
): Promise<ResultadoLogin> {
  const [u] = await db.select().from(usuarios).where(eq(usuarios.usuario, usuario.trim().toLowerCase()));
  if (!u) {
    await verificarClave(clave, await (hashFicticio ??= hashearClave("clave-ficticia")));
    return { ok: false, motivo: "credenciales" };
  }
  if (u.bloqueadoHasta && u.bloqueadoHasta > ahora) return { ok: false, motivo: "bloqueado" };

  if (!(await verificarClave(clave, u.claveHash))) {
    const [{ intentos }] = await db
      .update(usuarios)
      .set({ intentosFallidos: sql`${usuarios.intentosFallidos} + 1` })
      .where(eq(usuarios.id, u.id))
      .returning({ intentos: usuarios.intentosFallidos });
    if (intentos >= MAX_INTENTOS) {
      await db
        .update(usuarios)
        .set({ intentosFallidos: 0, bloqueadoHasta: new Date(ahora.getTime() + BLOQUEO_MS) })
        .where(eq(usuarios.id, u.id));
    }
    return { ok: false, motivo: "credenciales" };
  }
  // Un usuario desactivado recibe el mismo mensaje que una contraseña incorrecta.
  if (!u.activo) return { ok: false, motivo: "credenciales" };

  await db
    .update(usuarios)
    .set({ intentosFallidos: 0, bloqueadoHasta: null, ultimoIngreso: ahora })
    .where(eq(usuarios.id, u.id));
  return { ok: true, usuarioId: u.id, debeCambiarClave: u.debeCambiarClave };
}

/** Crea la sesión y devuelve el token para la cookie. En la base solo queda su hash. */
export async function crearSesion(db: Ejecutor, usuarioId: number, ahora = new Date()) {
  const token = randomBytes(32).toString("base64url");
  const expiraEn = new Date(ahora.getTime() + DURACION_SESION_MS);
  await db.insert(sesiones).values({ id: hashToken(token), usuarioId, expiraEn });
  await db.delete(sesiones).where(lt(sesiones.expiraEn, ahora));
  return { token, expiraEn };
}

/** La sesión del token, o null si no existe, venció o el usuario fue desactivado. */
export async function validarSesion(db: Ejecutor, token: string, ahora = new Date()): Promise<Sesion | null> {
  const [fila] = await db
    .select({
      usuarioId: usuarios.id,
      usuario: usuarios.usuario,
      nombre: usuarios.nombre,
      rol: usuarios.rol,
      debeCambiarClave: usuarios.debeCambiarClave,
    })
    .from(sesiones)
    .innerJoin(usuarios, eq(usuarios.id, sesiones.usuarioId))
    .where(and(eq(sesiones.id, hashToken(token)), gt(sesiones.expiraEn, ahora), eq(usuarios.activo, true)));
  return fila ?? null;
}

export async function cerrarSesion(db: Ejecutor, token: string) {
  await db.delete(sesiones).where(eq(sesiones.id, hashToken(token)));
}

/** Cierra todas las sesiones del usuario, salvo la del token indicado (la del dispositivo actual). */
export async function cerrarSesionesDe(db: Ejecutor, usuarioId: number, exceptoToken?: string) {
  await db
    .delete(sesiones)
    .where(
      and(
        eq(sesiones.usuarioId, usuarioId),
        exceptoToken ? ne(sesiones.id, hashToken(exceptoToken)) : undefined,
      ),
    );
}
