"use server";

import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { destinoSeguro } from "@/lib/auth/cookie";
import { abrirSesion } from "@/lib/auth/dal";
import { autenticar } from "@/lib/auth/sesiones";

export type EstadoLogin = { error?: string; usuario?: string };

export async function iniciarSesion(_previo: EstadoLogin, form: FormData): Promise<EstadoLogin> {
  const usuario = String(form.get("usuario") ?? "").slice(0, 100);
  const clave = String(form.get("clave") ?? "").slice(0, 200);
  if (!usuario.trim() || !clave) return { error: "Complete usuario y contraseña.", usuario };

  const resultado = await autenticar(await getDb(), usuario, clave);
  if (!resultado.ok) {
    return {
      usuario,
      error:
        resultado.motivo === "bloqueado"
          ? "Demasiados intentos fallidos. Espere 15 minutos o pida a un administrador que restablezca la contraseña."
          : "Usuario o contraseña incorrectos.",
    };
  }

  await abrirSesion(resultado.usuarioId);
  redirect(resultado.debeCambiarClave ? "/cambiar-clave" : destinoSeguro(form.get("desde")));
}
