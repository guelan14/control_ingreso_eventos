"use client";

import { useActionState } from "react";
import { cambiarClave } from "./acciones";

export function FormularioClave() {
  const [estado, accion, enviando] = useActionState(cambiarClave, {});
  const campo = "w-full rounded-md border px-3 py-2";

  return (
    <form action={accion} className="space-y-4 rounded-lg border bg-white p-5">
      <label className="block space-y-1">
        <span className="text-sm font-medium">Contraseña actual</span>
        <input name="actual" type="password" required autoComplete="current-password" className={campo} />
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-medium">Contraseña nueva (mínimo 10 caracteres)</span>
        <input name="nueva" type="password" required minLength={10} autoComplete="new-password" className={campo} />
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-medium">Repetir la contraseña nueva</span>
        <input name="repetida" type="password" required autoComplete="new-password" className={campo} />
      </label>

      {estado.error && (
        <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          {estado.error}
        </p>
      )}

      <button
        disabled={enviando}
        className="rounded-md bg-slate-900 px-4 py-2 font-medium text-white disabled:opacity-40"
      >
        {enviando ? "Guardando…" : "Cambiar contraseña"}
      </button>
    </form>
  );
}
