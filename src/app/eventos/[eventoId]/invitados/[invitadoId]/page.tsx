import Link from "next/link";
import { notFound } from "next/navigation";
import { requerirSesion } from "@/lib/auth/dal";
import { puede } from "@/lib/auth/roles";
import { buscarEvento } from "@/lib/eventos/buscar";
import { formatearFechaHora, formatearHoraExacta } from "@/lib/fechas";
import { obtenerInvitado } from "@/lib/invitados/gestion";
import { qrSvg } from "@/lib/qr/qr";
import { FormularioEdicion } from "../formularios";

export default async function DetalleInvitado({
  params,
  searchParams,
}: PageProps<"/eventos/[eventoId]/invitados/[invitadoId]">) {
  const sesion = await requerirSesion("invitados:ver");
  const { eventoId, invitadoId } = await params;
  const encontrado = await buscarEvento(eventoId);
  const id = Number(invitadoId);
  if (!encontrado || !Number.isInteger(id) || id <= 0) notFound();
  const { db, evento } = encontrado;
  const invitado = await obtenerInvitado(db, evento.id, id);
  if (!invitado) notFound();
  const recienCreado = (await searchParams).creado === "1";
  // Los de la puerta ya entraron: no necesitan QR.
  const svg = puede(sesion.rol, "qr:generar") && invitado.origen === "lista" ? await qrSvg(invitado.codigo) : null;

  const dato = (titulo: string, valor: string | null) => (
    <div>
      <dt className="text-sm text-slate-500">{titulo}</dt>
      <dd className="font-medium">{valor ?? "—"}</dd>
    </div>
  );

  return (
    <div className="max-w-3xl space-y-5">
      <Link href={`/eventos/${evento.id}/invitados`} className="text-sm text-slate-600 underline">
        ← Volver a la lista
      </Link>

      {recienCreado && (
        <p role="status" className="rounded-md border border-green-300 bg-green-50 p-3 text-green-800">
          Invitado dado de alta.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">{invitado.nombreApellido}</h1>
        {evento.usaPremiados && invitado.premiado && (
          <span className="rounded bg-red-600 px-2 py-0.5 text-sm font-bold text-white">PREMIADO</span>
        )}
        {invitado.origen === "puerta" && (
          <span className="rounded bg-slate-200 px-2 py-0.5 text-sm font-medium text-slate-800">Sin lista · alta en la puerta</span>
        )}
      </div>

      <dl className="grid gap-4 rounded-lg border bg-white p-5 sm:grid-cols-3">
        {dato("Empresa", invitado.empresa)}
        {dato("DNI", invitado.dni)}
        {dato("Cargo", invitado.cargo)}
        {evento.usaRubros && dato("Rubro", invitado.rubro)}
        {dato("Confirmación", invitado.confirmacion)}
        {dato("Sector", invitado.sector)}
        {invitado.acompanaA && dato("Acompaña a", invitado.acompanaA)}
        <div>
          <dt className="text-sm text-slate-500">Ingreso</dt>
          <dd className="font-medium">
            {invitado.checkinEn ? (
              <span className="text-green-800">✓ {formatearHoraExacta(invitado.checkinEn)}</span>
            ) : (
              "Todavía no ingresó"
            )}
          </dd>
          <dd className="text-xs text-slate-500">Solo se registra desde el check-in.</dd>
        </div>
      </dl>

      {svg && (
        <section className="flex flex-wrap items-center gap-5 rounded-lg border bg-white p-5">
          {/* SVG armado en el servidor a partir de un código hexadecimal: no lleva texto cargado por usuarios. */}
          <div className="w-36 shrink-0" dangerouslySetInnerHTML={{ __html: svg }} />
          <div className="space-y-2">
            <h2 className="font-semibold">Código QR</h2>
            <p className="font-mono text-sm text-slate-600">{invitado.codigo}</p>
            <a
              href={`/api/eventos/${evento.id}/invitados/${invitado.id}/qr`}
              className="inline-block rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-slate-50"
            >
              Descargar PNG
            </a>
          </div>
        </section>
      )}

      {puede(sesion.rol, "invitados:editar") && (
        <FormularioEdicion
          config={{ eventoId: evento.id, usaRubros: evento.usaRubros, usaPremiados: evento.usaPremiados, rubros: evento.rubros }}
          invitadoId={invitado.id}
          iniciales={{
            confirmacion: invitado.confirmacion,
            sector: invitado.sector,
            cargo: invitado.cargo,
            premiado: invitado.premiado,
            rubroId: invitado.rubroId,
          }}
        />
      )}

      <section className="space-y-2">
        <h2 className="font-semibold">Historial de ingresos</h2>
        {invitado.historial.length === 0 ? (
          <p className="text-sm text-slate-600">Sin registros.</p>
        ) : (
          <ul className="divide-y rounded-lg border bg-white text-sm">
            {invitado.historial.map((h) => (
              <li key={h.id} className="flex flex-wrap gap-x-3 px-4 py-2">
                <span className="font-mono">{formatearFechaHora(h.registradoEn)}</span>
                <span>
                  {h.tipo === "correccion"
                    ? `Corrección de hora (antes ${h.horaAnterior ? formatearHoraExacta(h.horaAnterior) : "—"})`
                    : "Ingreso"}
                </span>
                <span className="text-slate-600">por {h.operador ?? "usuario eliminado"}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-xs text-slate-500">
        Cargado el {formatearFechaHora(invitado.creadoEn)} · última modificación {formatearFechaHora(invitado.actualizadoEn)}.
        Los invitados no se eliminan: si hace falta, se reimporta el Excel.
      </p>
    </div>
  );
}
