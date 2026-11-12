import Link from "next/link";
import { notFound } from "next/navigation";
import { requerirSesion } from "@/lib/auth/dal";
import { puede } from "@/lib/auth/roles";
import { formatearHora } from "@/lib/fechas";
import { buscarEvento } from "@/lib/eventos/buscar";
import { CONFIRMACION_VALORES } from "@/lib/invitados/constants";
import { listarSectores } from "@/lib/invitados/gestion";
import { filtrosInvitadosSchema, listarInvitados } from "@/lib/invitados/listar";

const PARAMETROS = ["q", "confirmacion", "sector", "rubroId", "checkin", "premiado"] as const;

/** Gestión de invitados (Módulo 3): tabla paginada con filtros combinables. */
export default async function Invitados({ params, searchParams }: PageProps<"/eventos/[eventoId]/invitados">) {
  const sesion = await requerirSesion("invitados:ver");
  const encontrado = await buscarEvento((await params).eventoId);
  if (!encontrado) notFound();
  const { db, evento } = encontrado;
  const edita = puede(sesion.rol, "invitados:editar");
  const exporta = puede(sesion.rol, "datos:exportar");

  // Solo los parámetros con valor: un <select> en "Todos" manda "" y no es un filtro.
  const consulta = await searchParams;
  const elegidos = Object.fromEntries(
    [...PARAMETROS, "pagina"].flatMap((k) => {
      const v = consulta[k];
      return typeof v === "string" && v.trim() !== "" ? [[k, v]] : [];
    }),
  );
  const filtros = filtrosInvitadosSchema.safeParse(elegidos);
  const [{ data, total, pagina, porPagina }, sectores] = await Promise.all([
    listarInvitados(db, evento.id, filtros.success ? filtros.data : {}),
    listarSectores(db, evento.id),
  ]);

  const paginas = Math.max(1, Math.ceil(total / porPagina));
  const activos = Object.fromEntries(Object.entries(elegidos).filter(([k]) => k !== "pagina"));
  const hayFiltros = filtros.success && Object.keys(activos).length > 0;
  const base = `/eventos/${evento.id}/invitados`;
  const enlace = (p: number) => `${base}?${new URLSearchParams({ ...activos, pagina: String(p) })}`;
  const valor = (k: string) => (typeof activos[k] === "string" ? activos[k] : "");
  const control = "rounded-md border bg-white px-3 py-2 text-sm";

  const columnas = [
    "Nombre",
    "Empresa",
    ...(evento.usaRubros ? ["Rubro"] : []),
    "Cargo",
    "Confirmación",
    "Sector",
    "Ingreso",
    ...(evento.usaPremiados ? [""] : []),
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">
          Invitados · {evento.nombre} ({total})
        </h1>
        <div className="flex flex-wrap gap-2">
          {exporta && (
            <a
              href={`/api/eventos/${evento.id}/exportar?lista=todos`}
              className="rounded-md border bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50"
            >
              Exportar a Excel
            </a>
          )}
          {edita && (
            <Link href={`${base}/nuevo`} className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white">
              Nuevo invitado
            </Link>
          )}
        </div>
      </div>

      <form className="flex flex-wrap items-end gap-2 rounded-lg border bg-white p-3">
        <label className="flex flex-col gap-1 text-xs text-slate-600">
          Buscar
          <input name="q" defaultValue={valor("q")} placeholder="Nombre, empresa o DNI" className={`${control} w-56`} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-600">
          Confirmación
          <select name="confirmacion" defaultValue={valor("confirmacion")} className={control}>
            <option value="">Todas</option>
            {CONFIRMACION_VALORES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-600">
          Sector
          <select name="sector" defaultValue={valor("sector")} className={control}>
            <option value="">Todos</option>
            {sectores.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        {evento.usaRubros && (
          <label className="flex flex-col gap-1 text-xs text-slate-600">
            Rubro
            <select name="rubroId" defaultValue={valor("rubroId")} className={control}>
              <option value="">Todos</option>
              {evento.rubros.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nombre}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="flex flex-col gap-1 text-xs text-slate-600">
          Ingreso
          <select name="checkin" defaultValue={valor("checkin")} className={control}>
            <option value="">Todos</option>
            <option value="si">Ya ingresó</option>
            <option value="no">No ingresó</option>
          </select>
        </label>
        {evento.usaPremiados && (
          <label className="flex flex-col gap-1 text-xs text-slate-600">
            Premiado
            <select name="premiado" defaultValue={valor("premiado")} className={control}>
              <option value="">Todos</option>
              <option value="si">Sí</option>
              <option value="no">No</option>
            </select>
          </label>
        )}
        <button className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white">Filtrar</button>
        {hayFiltros && (
          <Link href={base} className="px-2 py-2 text-sm text-slate-600 underline">
            Quitar filtros
          </Link>
        )}
      </form>

      {!filtros.success && (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Algún filtro de la dirección no es válido: se muestra la lista completa.
        </p>
      )}

      {data.length === 0 ? (
        <p className="text-slate-600">
          {hayFiltros
            ? "Ningún invitado coincide con los filtros."
            : "Todavía no hay invitados. Importe un Excel o cárguelos a mano."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-100 text-slate-600">
              <tr>
                {columnas.map((h) => (
                  <th key={h} className="px-3 py-2 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((i) => (
                <tr key={i.id} className={`border-t ${i.checkinEn ? "bg-green-50" : ""}`}>
                  <td className="px-3 py-2 font-medium">
                    <Link href={`${base}/${i.id}`} className="text-blue-800 hover:underline">
                      {i.nombreApellido}
                    </Link>
                    {i.origen === "puerta" && (
                      <span className="block text-xs font-normal text-slate-500">Sin lista · acompaña a {i.acompanaA}</span>
                    )}
                  </td>
                  <td className="px-3 py-2">{i.empresa}</td>
                  {evento.usaRubros && <td className="px-3 py-2">{i.rubro ?? "—"}</td>}
                  <td className="px-3 py-2">{i.cargo ?? "—"}</td>
                  <td className="px-3 py-2">{i.confirmacion}</td>
                  <td className="px-3 py-2">{i.sector ?? "—"}</td>
                  <td className="px-3 py-2">
                    {i.checkinEn ? (
                      <span className="rounded bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                        ✓ {formatearHora(i.checkinEn)}
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  {evento.usaPremiados && (
                    <td className="px-3 py-2">
                      {i.premiado && (
                        <span className="rounded bg-red-600 px-2 py-0.5 text-xs font-bold text-white">PREMIADO</span>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {paginas > 1 && (
        <nav className="flex items-center gap-3 text-sm">
          {pagina > 1 && (
            <Link href={enlace(pagina - 1)} className="underline">
              ← Anterior
            </Link>
          )}
          <span>
            Página {pagina} de {paginas}
          </span>
          {pagina < paginas && (
            <Link href={enlace(pagina + 1)} className="underline">
              Siguiente →
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
