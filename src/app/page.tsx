import Link from "next/link";
import { connection } from "next/server";
import { getDb } from "@/db/client";
import { listarEventos } from "@/lib/eventos/eventos";
import { formatearFecha } from "@/lib/fechas";

export default async function Inicio() {
  await connection();
  const eventos = await listarEventos(await getDb());

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Eventos</h1>
        <Link href="/eventos/nuevo" className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white">
          Nuevo evento
        </Link>
      </div>

      {eventos.length === 0 ? (
        <p className="text-slate-600">Todavía no hay eventos. Cree el primero para cargar invitados.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {eventos.map((e) => (
            <li key={e.id}>
              <Link
                href={`/eventos/${e.id}`}
                className="block rounded-lg border bg-white p-5 shadow-sm hover:border-slate-400"
              >
                <h2 className="font-semibold">{e.nombre}</h2>
                <p className="text-sm text-slate-600">{formatearFecha(e.fecha)}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
