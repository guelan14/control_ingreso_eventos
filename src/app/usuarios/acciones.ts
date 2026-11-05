"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { autorizarAccion } from "@/lib/auth/dal";
import { ROLES } from "@/lib/auth/roles";
import {
  cambiarEstado,
  cambiarRol,
  crearUsuario,
  nuevoUsuarioSchema,
  restablecerClave,
  UltimoAdminError,
  UsuarioDuplicadoError,
} from "@/lib/auth/usuarios";
import { z } from "@/lib/zod";

export type EstadoUsuario = { error?: string; mensaje?: string; claveTemporal?: string };

export async function crearUsuarioAccion(_previo: EstadoUsuario, form: FormData): Promise<EstadoUsuario> {
  await autorizarAccion("usuarios:gestionar");
  const datos = nuevoUsuarioSchema.safeParse({
    usuario: form.get("usuario"),
    nombre: form.get("nombre"),
    rol: form.get("rol"),
  });
  if (!datos.success) return { error: datos.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(" ") };

  try {
    const { usuario, claveTemporal } = await crearUsuario(await getDb(), datos.data);
    revalidatePath("/usuarios");
    return { mensaje: `Usuario "${usuario.usuario}" creado.`, claveTemporal };
  } catch (error) {
    if (error instanceof UsuarioDuplicadoError) return { error: error.message };
    throw error;
  }
}

const operacionSchema = z.discriminatedUnion("operacion", [
  z.object({ operacion: z.literal("rol"), id: z.coerce.number().int().positive(), rol: z.enum(ROLES) }),
  z.object({ operacion: z.literal("activar"), id: z.coerce.number().int().positive() }),
  z.object({ operacion: z.literal("desactivar"), id: z.coerce.number().int().positive() }),
  z.object({ operacion: z.literal("clave"), id: z.coerce.number().int().positive() }),
]);

/** Cambios sobre un usuario existente, desde los botones de cada fila. */
export async function modificarUsuarioAccion(_previo: EstadoUsuario, form: FormData): Promise<EstadoUsuario> {
  const sesion = await autorizarAccion("usuarios:gestionar");
  const datos = operacionSchema.safeParse(Object.fromEntries(form));
  if (!datos.success) return { error: "Operación inválida." };
  const op = datos.data;
  if (op.id === sesion.usuarioId && op.operacion !== "clave") {
    return { error: "No puede cambiar su propio rol ni desactivarse. Pídaselo a otro administrador." };
  }

  const db = await getDb();
  try {
    let resultado: EstadoUsuario;
    switch (op.operacion) {
      case "rol":
        await cambiarRol(db, op.id, op.rol);
        resultado = { mensaje: "Rol actualizado." };
        break;
      case "activar":
      case "desactivar":
        await cambiarEstado(db, op.id, op.operacion === "activar");
        resultado = { mensaje: op.operacion === "activar" ? "Usuario activado." : "Usuario desactivado." };
        break;
      case "clave":
        resultado = { mensaje: "Contraseña restablecida.", claveTemporal: await restablecerClave(db, op.id) };
        break;
    }
    revalidatePath("/usuarios");
    return resultado;
  } catch (error) {
    if (error instanceof UltimoAdminError) return { error: error.message };
    throw error;
  }
}
