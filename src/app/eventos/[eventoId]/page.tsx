import Link from "next/link";
import { notFound } from "next/navigation";
import { buscarEvento } from "@/lib/eventos/buscar";
import { formatearFecha } from "@/lib/fechas";

export default async function DetalleEvento({ params }: PageProps<"/eventos/[eventoId]">) {
  const encontrado = await buscarEvento((await params).eventoId);
  if (!encontrado) notFound();
  const { evento } = encontrado;

  const acciones = [
    { href: `/eventos/${evento.id}/importar`, titulo: "Importar invitados", detalle: "Excel con validación previa" },
    { href: `/eventos/${evento.id}/invitados`, titulo: "Lista de invitados", detalle: "Buscar y filtrar" },
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
