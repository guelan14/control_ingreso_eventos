"use client";

import { useActionState } from "react";
import { iniciarSesion } from "./acciones";

export function FormularioLogin({ desde }: { desde: string }) {
  const [estado, accion, enviando] = useActionState(iniciarSesion, {});
  const campo = "w-full rounded-md border px-3 py-2";

  return (
    <form action={accion} className="space-y-4 rounded-lg border bg-white p-5">
      <input type="hidden" name="desde" value={desde} />
      <label className="block space-y-1">
        <span className="text-sm font-medium">Usuario</span>
        <input
          name="usuario"
          required
          autoComplete="username"
          autoCapitalize="none"
          defaultValue={estado.usuario}
          className={campo}
        />
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-medium">Contraseña</span>
        <input name="clave" type="password" required autoComplete="current-password" className={campo} />
      </label>

      {estado.error && (
        <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          {estado.error}
        </p>
      )}

      <button
        disabled={enviando}
        className="w-full rounded-md bg-slate-900 px-4 py-2 font-medium text-white disabled:opacity-40"
      >
        {enviando ? "Ingresando…" : "Ingresar"}
      </button>
    </form>
  );
}
