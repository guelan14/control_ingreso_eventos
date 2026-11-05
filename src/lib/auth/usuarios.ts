import { and, asc, eq, ne } from "drizzle-orm";
import type { Db, Ejecutor } from "@/db/create-db";
import { usuarios } from "@/db/schema";
import { z } from "@/lib/zod";
import { generarClaveTemporal, hashearClave, nuevaClaveSchema, verificarClave } from "./clave";
import { ROLES, type Rol } from "./roles";
import { cerrarSesionesDe } from "./sesiones";

export const nuevoUsuarioSchema = z.object({
  usuario: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9._-]{3,40}$/, "Use de 3 a 40 letras sin tildes, números, punto o guiones."),
  nombre: z.string().trim().min(3).max(100),
  rol: z.enum(ROLES),
});
export type NuevoUsuario = z.output<typeof nuevoUsuarioSchema>;

export class UsuarioDuplicadoError extends Error {
  constructor(usuario: string) {
    super(`Ya existe el usuario "${usuario}".`);
  }
}

export class UltimoAdminError extends Error {
  constructor() {
    super("Tiene que quedar al menos un administrador activo.");
  }
}

export class ClaveIncorrectaError extends Error {
  constructor() {
    super("La contraseña actual no es correcta.");
  }
}

const columnasPublicas = {
  id: usuarios.id,
  usuario: usuarios.usuario,
  nombre: usuarios.nombre,
  rol: usuarios.rol,
  activo: usuarios.activo,
  debeCambiarClave: usuarios.debeCambiarClave,
  bloqueadoHasta: usuarios.bloqueadoHasta,
  ultimoIngreso: usuarios.ultimoIngreso,
};

/**
 * Crea un usuario con una contraseña temporal que deberá cambiar al ingresar.
 * Devuelve la contraseña para mostrarla una sola vez a quien lo creó.
 */
export async function crearUsuario(db: Db, datos: NuevoUsuario) {
  const [existente] = await db.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.usuario, datos.usuario));
  if (existente) throw new UsuarioDuplicadoError(datos.usuario);

  const claveTemporal = generarClaveTemporal();
  const [usuario] = await db
    .insert(usuarios)
    .values({ ...datos, claveHash: await hashearClave(claveTemporal), debeCambiarClave: true })
    .returning(columnasPublicas);
  return { usuario, claveTemporal };
}

export async function listarUsuarios(db: Ejecutor) {
  return db.select(columnasPublicas).from(usuarios).orderBy(asc(usuarios.nombre));
}

/** Error si el cambio dejaría al sistema sin ningún administrador activo. */
async function asegurarOtroAdmin(tx: Ejecutor, usuarioId: number) {
  const [objetivo] = await tx.select().from(usuarios).where(eq(usuarios.id, usuarioId));
  if (!objetivo || objetivo.rol !== "admin" || !objetivo.activo) return;
  const otros = await tx.$count(
    usuarios,
    and(eq(usuarios.rol, "admin"), eq(usuarios.activo, true), ne(usuarios.id, usuarioId)),
  );
  if (otros === 0) throw new UltimoAdminError();
}

export async function cambiarRol(db: Db, usuarioId: number, rol: Rol) {
  await db.transaction(async (tx) => {
    if (rol !== "admin") await asegurarOtroAdmin(tx, usuarioId);
    await tx.update(usuarios).set({ rol }).where(eq(usuarios.id, usuarioId));
  });
}

/** Desactivar cierra sus sesiones al instante. Los datos del usuario se conservan. */
export async function cambiarEstado(db: Db, usuarioId: number, activo: boolean) {
  await db.transaction(async (tx) => {
    if (!activo) {
      await asegurarOtroAdmin(tx, usuarioId);
      await cerrarSesionesDe(tx, usuarioId);
    }
    await tx.update(usuarios).set({ activo }).where(eq(usuarios.id, usuarioId));
  });
}

/** Contraseña temporal nueva (por olvido o bloqueo). Cierra sus sesiones y lo desbloquea. */
export async function restablecerClave(db: Db, usuarioId: number) {
  const claveTemporal = generarClaveTemporal();
  const claveHash = await hashearClave(claveTemporal);
  await db.transaction(async (tx) => {
    await tx
      .update(usuarios)
      .set({ claveHash, debeCambiarClave: true, intentosFallidos: 0, bloqueadoHasta: null })
      .where(eq(usuarios.id, usuarioId));
    await cerrarSesionesDe(tx, usuarioId);
  });
  return claveTemporal;
}

export const cambioDeClaveSchema = z
  .object({ actual: z.string().min(1, "Ingrese la contraseña actual."), nueva: nuevaClaveSchema, repetida: z.string() })
  .refine((d) => d.nueva === d.repetida, { message: "Las contraseñas nuevas no coinciden.", path: ["repetida"] })
  .refine((d) => d.nueva !== d.actual, { message: "La contraseña nueva tiene que ser distinta.", path: ["nueva"] });

/** El usuario cambia su propia contraseña. Se cierran sus otras sesiones; la actual sigue abierta. */
export async function cambiarClavePropia(
  db: Db,
  usuarioId: number,
  { actual, nueva }: { actual: string; nueva: string },
  tokenActual?: string,
) {
  const [u] = await db.select({ claveHash: usuarios.claveHash }).from(usuarios).where(eq(usuarios.id, usuarioId));
  if (!u || !(await verificarClave(actual, u.claveHash))) throw new ClaveIncorrectaError();

  const claveHash = await hashearClave(nueva);
  await db.transaction(async (tx) => {
    await tx.update(usuarios).set({ claveHash, debeCambiarClave: false }).where(eq(usuarios.id, usuarioId));
    await cerrarSesionesDe(tx, usuarioId, tokenActual);
  });
}
