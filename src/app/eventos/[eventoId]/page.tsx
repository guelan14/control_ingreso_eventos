import Link from "next/link";
import { notFound } from "next/navigation";
import { requerirSesion } from "@/lib/auth/dal";
import { puede } from "@/lib/auth/roles";
import { buscarEvento } from "@/lib/eventos/buscar";
import { formatearFecha } from "@/lib/fechas";

export default async function DetalleEvento({ params }: PageProps<"/eventos/[eventoId]">) {
  const sesion = await requerirSesion("eventos:ver");
  const encontrado = await buscarEvento((await params).eventoId);
  if (!encontrado) notFound();
  const { evento } = encontrado;

  const acciones = [
    ...(puede(sesion.rol, "checkin:registrar")
      ? [{ href: `/eventos/${evento.id}/checkin`, titulo: "Check-in en puerta", detalle: "Registrar ingresos desde el celular o la tablet" }]
      : []),
    ...(puede(sesion.rol, "panel:ver")
      ? [{ href: `/eventos/${evento.id}/panel`, titulo: "Panel en vivo", detalle: "Ingresos, premiados pendientes y rubros" }]
      : []),
    ...(puede(sesion.rol, "invitados:importar")
      ? [{ href: `/eventos/${evento.id}/importar`, titulo: "Importar invitados", detalle: "Excel con validación previa" }]
      : []),
    { href: `/eventos/${evento.id}/invitados`, titulo: "Lista de invitados", detalle: "Buscar, filtrar y exportar" },
    ...(puede(sesion.rol, "qr:generar")
      ? [{ href: `/eventos/${evento.id}/qr`, titulo: "Códigos QR", detalle: "Descargar en ZIP o imprimir tarjetas" }]
      : []),
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{evento.nombre}</h1>
        <p className="text-slate-600">
          {formatearFecha(evento.fecha)} · {evento.usaPremiados ? "Con premiados" : "Sin premiados"} ·{" "}
          {evento.usaRubros ? `${evento.rubros.length} rubros` : "Sin rubros"}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {acciones.map((a) => (
          <Link key={a.href} href={a.href} className="rounded-lg border bg-white p-5 shadow-sm hover:border-slate-400">
            <h2 className="font-semibold">{a.titulo}</h2>
            <p className="text-sm text-slate-600">{a.detalle}</p>
          </Link>
        ))}
      </div>

      {evento.usaRubros && (
        <section className="space-y-2">
          <h2 className="font-semibold">Rubros</h2>
          <ul className="flex flex-wrap gap-2">
            {evento.rubros.map((r) => (
              <li key={r.id} className="rounded-full border bg-white px-3 py-1 text-sm">
                {r.nombre}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
