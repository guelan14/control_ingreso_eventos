"use client";

import { useState } from "react";
import type { ReporteImportacion } from "@/lib/importacion/importar";

type Estado =
  | { tipo: "inicial" }
  | { tipo: "cargando"; accion: "validar" | "importar" }
  | { tipo: "reporte"; reporte: ReporteImportacion }
  | { tipo: "error"; mensaje: string };

async function enviar(archivo: File, confirmar: boolean): Promise<ReporteImportacion> {
  const form = new FormData();
  form.append("archivo", archivo);
  if (confirmar) form.append("confirmar", "true");

  const respuesta = await fetch("/api/import", { method: "POST", body: form });
  const cuerpo = await respuesta.json().catch(() => null);
  // 422 trae un reporte con errores: se muestra igual que una validación.
  if (respuesta.ok || respuesta.status === 422) return cuerpo as ReporteImportacion;
  throw new Error(cuerpo?.error?.mensaje ?? `Error ${respuesta.status}`);
}

export function FormularioImportacion() {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [estado, setEstado] = useState<Estado>({ tipo: "inicial" });

  const ejecutar = async (confirmar: boolean) => {
    if (!archivo) return;
    setEstado({ tipo: "cargando", accion: confirmar ? "importar" : "validar" });
    try {
      setEstado({ tipo: "reporte", reporte: await enviar(archivo, confirmar) });
    } catch (e) {
      const mensaje = e instanceof TypeError ? "Sin conexión con el servidor." : (e as Error).message;
      setEstado({ tipo: "error", mensaje });
    }
  };

  const cargando = estado.tipo === "cargando";
  const reporte = estado.tipo === "reporte" ? estado.reporte : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-white p-4">
        <input
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(e) => {
            setArchivo(e.target.files?.[0] ?? null);
            setEstado({ tipo: "inicial" });
          }}
          className="text-sm"
        />
        <button
          onClick={() => ejecutar(false)}
          disabled={!archivo || cargando}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          {estado.tipo === "cargando" && estado.accion === "validar" ? "Validando…" : "Validar archivo"}
        </button>
      </div>

      {estado.tipo === "error" && (
        <p className="rounded-lg border border-red-300 bg-red-50 p-4 text-red-800">{estado.mensaje}</p>
      )}

      {reporte && <Reporte reporte={reporte} />}

      {reporte?.valido && !reporte.importado && (
        <button
          onClick={() => ejecutar(true)}
          disabled={cargando}
          className="rounded-md bg-green-700 px-5 py-3 font-semibold text-white disabled:opacity-40"
        >
          Confirmar importación ({reporte.nuevos} nuevos, {reporte.actualizados} actualizados)
        </button>
      )}
    </div>
  );
}

function Reporte({ reporte }: { reporte: ReporteImportacion }) {
  return (
    <section className="space-y-3">
      {reporte.importado ? (
        <p className="rounded-lg border border-green-300 bg-green-50 p-4 font-medium text-green-800">
          ✓ Importación completada: {reporte.nuevos} invitados nuevos y {reporte.actualizados} actualizados.
        </p>
      ) : reporte.valido ? (
        <p className="rounded-lg border border-blue-300 bg-blue-50 p-4 text-blue-900">
          Archivo válido: {reporte.filasValidas} invitados listos ({reporte.nuevos} nuevos, {reporte.actualizados}{" "}
          ya existentes que se actualizarán). Revise y confirme.
        </p>
      ) : (
        <p className="rounded-lg border border-red-300 bg-red-50 p-4 font-medium text-red-800">
          El archivo tiene {reporte.errores.length} error(es). Corríjalos en el Excel y vuelva a subirlo: no se
          importó nada.
        </p>
      )}

      {reporte.columnasOmitidas.length > 0 && (
        <p className="text-sm text-slate-600">
          Columnas opcionales ausentes: {reporte.columnasOmitidas.join(", ")}. Esos datos no se modifican en
          invitados existentes.
        </p>
      )}

      {reporte.advertencias.map((a, i) => (
        <p key={i} className="text-sm text-amber-700">⚠ {a.mensaje}</p>
      ))}

      {reporte.errores.length > 0 && (
        <div className="overflow-x-auto rounded-lg border bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-100 text-slate-600">
              <tr>
                <th className="px-3 py-2 font-medium">Fila</th>
                <th className="px-3 py-2 font-medium">Columna</th>
                <th className="px-3 py-2 font-medium">Problema</th>
              </tr>
            </thead>
            <tbody>
              {reporte.errores.map((e, i) => (
                <tr key={i} className="border-t">
                  <td className="px-3 py-2 font-mono">{e.fila ?? "—"}</td>
                  <td className="px-3 py-2 font-mono">{e.campo ?? "—"}</td>
                  <td className="px-3 py-2">{e.mensaje}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
