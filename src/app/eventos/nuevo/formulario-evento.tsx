"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { RUBROS_SUGERIDOS } from "@/lib/invitados/constants";

type ErrorApi = { mensaje: string; detalles?: { campo: string; mensaje: string }[] };

export function FormularioEvento() {
  const router = useRouter();
  const [usaRubros, setUsaRubros] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<ErrorApi | null>(null);

  const enviar = async (form: FormData) => {
    setEnviando(true);
    setError(null);
    try {
      const respuesta = await fetch("/api/eventos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre: form.get("nombre"),
          fecha: form.get("fecha"),
          usaRubros,
          usaPremiados: form.get("usaPremiados") === "on",
          rubros: String(form.get("rubros") ?? "")
            .split("\n")
            .map((r) => r.trim())
            .filter(Boolean),
        }),
      });
      const cuerpo = await respuesta.json().catch(() => null);
      if (!respuesta.ok) {
        setError(cuerpo?.error ?? { mensaje: `Error ${respuesta.status}` });
        return;
      }
      router.push(`/eventos/${cuerpo.id}`);
    } catch {
      setError({ mensaje: "Sin conexión con el servidor." });
    } finally {
      setEnviando(false);
    }
  };

  const campo = "w-full rounded-md border px-3 py-2";

  return (
    <form action={enviar} className="space-y-4 rounded-lg border bg-white p-5">
      <label className="block space-y-1">
        <span className="text-sm font-medium">Nombre</span>
        <input name="nombre" required minLength={3} placeholder="Aniversario 2027" className={campo} />
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-medium">Fecha</span>
        <input name="fecha" type="date" required className={campo} />
      </label>

      <label className="flex items-center gap-2">
        <input type="checkbox" name="usaPremiados" defaultChecked />
        <span>Tiene premiados (alerta en el check-in)</span>
      </label>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={usaRubros} onChange={(e) => setUsaRubros(e.target.checked)} />
        <span>Agrupa a los invitados por rubro</span>
      </label>

      {usaRubros && (
        <label className="block space-y-1">
          <span className="text-sm font-medium">Rubros (uno por línea)</span>
          <textarea
            name="rubros"
            rows={8}
            defaultValue={RUBROS_SUGERIDOS.join("\n")}
            className={`${campo} font-mono text-sm`}
          />
        </label>
      )}

      {error && (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          <p>{error.mensaje}</p>
          {error.detalles?.map((d) => (
            <p key={d.campo}>
              {d.campo}: {d.mensaje}
            </p>
          ))}
        </div>
      )}

      <button
        disabled={enviando}
        className="rounded-md bg-slate-900 px-4 py-2 font-medium text-white disabled:opacity-40"
      >
        {enviando ? "Creando…" : "Crear evento"}
      </button>
    </form>
  );
}
