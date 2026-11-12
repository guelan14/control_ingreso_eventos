"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatearHoraExacta } from "@/lib/fechas";
import { porcentaje, SEGUNDOS_ACTUALIZACION, type Panel, type PremiadoPendiente } from "@/lib/panel/tipos";

type Estado = "ok" | "actualizando" | "sin_conexion" | "sesion_vencida";

export function PanelEnVivo({
  eventoId,
  nombreEvento,
  usaRubros,
  usaPremiados,
  puedeExportar,
  inicial,
}: {
  eventoId: number;
  nombreEvento: string;
  usaRubros: boolean;
  usaPremiados: boolean;
  puedeExportar: boolean;
  inicial: Panel;
}) {
  const [panel, setPanel] = useState(inicial);
  const [estado, setEstado] = useState<Estado>("ok");
  const enCurso = useRef(false);

  const actualizar = useCallback(async () => {
    if (enCurso.current) return;
    enCurso.current = true;
    setEstado("actualizando");
    try {
      const r = await fetch(`/api/eventos/${eventoId}/panel`, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
      if (r.status === 401) return setEstado("sesion_vencida");
      if (!r.ok) throw new Error(String(r.status));
      setPanel(await r.json());
      setEstado("ok");
    } catch {
      // Se siguen mostrando los últimos datos, con aviso; el próximo ciclo reintenta.
      setEstado("sin_conexion");
    } finally {
      enCurso.current = false;
    }
  }, [eventoId]);

  useEffect(() => {
    const intervalo = setInterval(actualizar, SEGUNDOS_ACTUALIZACION * 1000);
    // Al volver a la pestaña (o desbloquear el celular), actualizar enseguida.
    const alVolver = () => document.visibilityState === "visible" && actualizar();
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      clearInterval(intervalo);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, [actualizar]);

  const { totales, premiados } = panel;
  const hora = formatearHoraExacta(panel.generadoEn);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Panel · {nombreEvento}</h1>
          <p className="text-sm text-slate-600">
            Datos de las {hora} · se actualiza cada {SEGUNDOS_ACTUALIZACION} segundos
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {puedeExportar && (
            <a
              href={`/api/eventos/${eventoId}/exportar?lista=presentes`}
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium"
            >
              Descargar presentes (Excel)
            </a>
          )}
          <button
            onClick={actualizar}
            disabled={estado === "actualizando"}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {estado === "actualizando" ? "Actualizando…" : "Actualizar ahora"}
          </button>
        </div>
      </div>

      {estado === "sin_conexion" && (
        <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-red-800">
          Sin conexión con el servidor: se muestran los datos de las {hora}. Se reintenta solo.
        </p>
      )}
      {estado === "sesion_vencida" && (
        <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-red-800">
          Su sesión venció.{" "}
          <a href={`/login?desde=/eventos/${eventoId}/panel`} className="font-semibold underline">
            Ingrese de nuevo
          </a>{" "}
          para seguir viendo el panel.
        </p>
      )}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl bg-slate-900 p-5 text-white sm:col-span-2 lg:col-span-1">
          <p className="text-sm uppercase tracking-wide text-slate-300">Ingresaron</p>
          <p className="text-6xl font-black tabular-nums">{totales.ingresados}</p>
          {totales.sinLista > 0 && (
            <p className="text-sm text-slate-300">incluye {totales.sinLista} sin estar en la lista</p>
          )}
        </div>
        <Indicador
          titulo="Sobre confirmados"
          valor={`${porcentaje(totales.ingresados, totales.confirmados)} %`}
          detalle={`${totales.ingresados} de ${totales.confirmados} confirmados`}
        />
        <Indicador
          titulo="Sobre invitaciones enviadas"
          valor={`${porcentaje(totales.ingresados, totales.invitados)} %`}
          detalle={`${totales.ingresados} de ${totales.invitados} invitados`}
        />
        <Indicador titulo="Faltan llegar" valor={String(totales.faltan)} detalle="confirmados que todavía no ingresaron" />
      </section>

      {usaPremiados && <SeccionPremiados premiados={premiados} />}

      <div className="grid gap-6 lg:grid-cols-2">
        {usaRubros && (
          <section className="space-y-3 rounded-xl border bg-white p-5">
            <h2 className="text-lg font-bold">Ingresos por rubro</h2>
            <ul className="space-y-3">
              {panel.rubros.map((r) => {
                const pct = porcentaje(r.ingresados, r.confirmados);
                return (
                  <li key={r.id} className={r.invitados === 0 ? "opacity-50" : ""}>
                    <div className="flex justify-between gap-2 text-sm">
                      <span className="font-medium">{r.nombre}</span>
                      <span className="tabular-nums text-slate-600">
                        {r.ingresados} de {r.confirmados} confirmados · {pct} %
                      </span>
                    </div>
                    <div
                      role="progressbar"
                      aria-label={r.nombre}
                      aria-valuenow={pct}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      className="mt-1 h-3 overflow-hidden rounded-full bg-slate-200"
                    >
                      <div className="h-full rounded-full bg-green-600" style={{ width: `${Math.min(pct, 100)}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <section className="space-y-3 rounded-xl border bg-white p-5">
          <h2 className="text-lg font-bold">Últimos ingresos</h2>
          {panel.ultimos.length === 0 ? (
            <p className="text-slate-600">Todavía no ingresó nadie.</p>
          ) : (
            <ol className="divide-y">
              {panel.ultimos.map((u) => (
                <li key={u.id} className="flex items-center gap-3 py-2">
                  <span className="w-20 shrink-0 font-mono text-sm tabular-nums text-slate-600">
                    {formatearHoraExacta(u.registradoEn)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{u.nombreApellido}</span>
                    <span className="block truncate text-sm text-slate-600">{u.empresa}</span>
                  </span>
                  {u.origen === "puerta" && (
                    <span className="rounded bg-slate-200 px-2 py-0.5 text-xs text-slate-700">sin lista</span>
                  )}
                  {u.tipo === "correccion" && (
                    <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-900">corrección de hora</span>
                  )}
                  {u.premiado && <span className="rounded bg-red-600 px-2 py-0.5 text-xs font-bold text-white">PREMIADO</span>}
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}

function Indicador({ titulo, valor, detalle }: { titulo: string; valor: string; detalle: string }) {
  return (
    <div className="rounded-xl border bg-white p-5">
      <p className="text-sm uppercase tracking-wide text-slate-500">{titulo}</p>
      <p className="text-4xl font-bold tabular-nums">{valor}</p>
      <p className="text-sm text-slate-600">{detalle}</p>
    </div>
  );
}

function SeccionPremiados({ premiados }: { premiados: Panel["premiados"] }) {
  if (premiados.total === 0) {
    return <p className="rounded-xl border bg-white p-5 text-slate-600">Este evento todavía no tiene premiados cargados.</p>;
  }

  return (
    <section className="space-y-3">
      {premiados.pendientes.length === 0 ? (
        <div role="status" className="rounded-xl bg-green-600 p-5 text-white">
          <p className="text-2xl font-bold">✓ Todos los premiados confirmados ya ingresaron</p>
          <p>
            {premiados.ingresados} de {premiados.total} premiados en el salón.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border-2 border-red-600 bg-white">
          <div className="flex flex-wrap items-baseline justify-between gap-2 bg-red-600 px-5 py-3 text-white">
            <h2 className="text-xl font-black">Premiados que todavía no ingresaron: {premiados.pendientes.length}</h2>
            <span className="font-medium">
              Ingresaron {premiados.ingresados} de {premiados.total}
            </span>
          </div>
          <TablaPremiados filas={premiados.pendientes} />
        </div>
      )}

      {premiados.avisaronQueNoVienen.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-amber-400 bg-white">
          <h3 className="bg-amber-100 px-5 py-2 font-bold text-amber-900">
            Premiados que avisaron que no vienen: {premiados.avisaronQueNoVienen.length}
          </h3>
          <TablaPremiados filas={premiados.avisaronQueNoVienen} />
        </div>
      )}
    </section>
  );
}

function TablaPremiados({ filas }: { filas: PremiadoPendiente[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-slate-600">
          <tr>
            {["Nombre", "Empresa", "Rubro", "Sector", "Cargo"].map((h) => (
              <th key={h} className="px-5 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((p) => (
            <tr key={p.id} className="border-t">
              <td className="px-5 py-2 text-base font-semibold">{p.nombreApellido}</td>
              <td className="px-5 py-2">{p.empresa}</td>
              <td className="px-5 py-2">{p.rubro ?? "—"}</td>
              <td className="px-5 py-2">{p.sector ?? "—"}</td>
              <td className="px-5 py-2">{p.cargo ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
