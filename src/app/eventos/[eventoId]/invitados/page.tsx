import Link from "next/link";
import { notFound } from "next/navigation";
import { buscarEvento } from "@/lib/eventos/buscar";
import { filtrosInvitadosSchema, listarInvitados } from "@/lib/invitados/listar";

// Vista para verificar la importación, con búsqueda y paginado. Filtros completos, edición
// y alta manual llegan con el módulo de gestión.
export default async function Invitados({
  params,
  searchParams,
}: PageProps<"/eventos/[eventoId]/invitados">) {
  const encontrado = await buscarEvento((await params).eventoId);
  if (!encontrado) notFound();
  const { db, evento } = encontrado;

  const consulta = await searchParams;
  const filtros = filtrosInvitadosSchema.safeParse({
    q: typeof consulta.q === "string" ? consulta.q : undefined,
    pagina: typeof consulta.pagina === "string" ? consulta.pagina : undefined,
  });
  const { data, total, pagina, porPagina } = await listarInvitados(
    db,
    evento.id,
    filtros.success ? filtros.data : {},
  );
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  const q = filtros.success ? (filtros.data.q ?? "") : "";
  const enlace = (p: number) =>
    `/eventos/${evento.id}/invitados?${new URLSearchParams({ ...(q && { q }), pagina: String(p) })}`;

  const columnas = [
    "Nombre",
    "Empresa",
    ...(evento.usaRubros ? ["Rubro"] : []),
    "Cargo",
    "Confirmación",
    "Sector",
    ...(evento.usaPremiados ? [""] : []),
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">
          Invitados · {evento.nombre} ({total})
        </h1>
        <form className="flex gap-2">
          <input
            name="q"
            defaultValue={q}
            placeholder="Buscar por nombre, empresa o DNI"
            className="w-64 rounded-md border px-3 py-2 text-sm"
          />
          <button className="rounded-md bg-slate-900 px-3 py-2 text-sm text-white">Buscar</button>
        </form>
      </div>

      {data.length === 0 ? (
        <p className="text-slate-600">
          {q ? "Ningún invitado coincide con la búsqueda." : "Todavía no hay invitados. Importe un Excel para comenzar."}
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
                <tr key={i.id} className="border-t">
                  <td className="px-3 py-2 font-medium">{i.nombreApellido}</td>
                  <td className="px-3 py-2">{i.empresa}</td>
                  {evento.usaRubros && <td className="px-3 py-2">{i.rubro ?? "—"}</td>}
                  <td className="px-3 py-2">{i.cargo ?? "—"}</td>
                  <td className="px-3 py-2">{i.confirmacion}</td>
                  <td className="px-3 py-2">{i.sector ?? "—"}</td>
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
          {pagina > 1 && <Link href={enlace(pagina - 1)} className="underline">← Anterior</Link>}
          <span>
            Página {pagina} de {paginas}
          </span>
          {pagina < paginas && <Link href={enlace(pagina + 1)} className="underline">Siguiente →</Link>}
        </nav>
      )}
    </div>
  );
}
