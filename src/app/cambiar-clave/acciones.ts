"use server";

import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { obtenerSesion, tokenActual } from "@/lib/auth/dal";
import { cambiarClavePropia, cambioDeClaveSchema, ClaveIncorrectaError } from "@/lib/auth/usuarios";

export type EstadoCambioClave = { error?: string };

export async function cambiarClave(_previo: EstadoCambioClave, form: FormData): Promise<EstadoCambioClave> {
  // Única acción permitida con la contraseña temporal pendiente de cambio.
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const datos = cambioDeClaveSchema.safeParse({
    actual: form.get("actual"),
    nueva: form.get("nueva"),
    repetida: form.get("repetida"),
  });
  if (!datos.success) return { error: datos.error.issues[0].message };

  try {
    await cambiarClavePropia(await getDb(), sesion.usuarioId, datos.data, await tokenActual());
  } catch (error) {
    if (error instanceof ClaveIncorrectaError) return { error: error.message };
    throw error;
  }
  redirect("/");
}
