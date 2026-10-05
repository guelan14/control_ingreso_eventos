import { connection } from "next/server";
import { getDb } from "@/db/client";
import { listarInvitados } from "@/lib/invitados/listar";

// Vista mínima para verificar la importación. Filtros, edición y alta manual: semana 4.
export default async function Invitados() {
  await connection();
  const lista = listarInvitados(getDb(), {});

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Invitados ({lista.length})</h1>
      {lista.length === 0 ? (
        <p className="text-slate-600">Todavía no hay invitados. Importe un Excel para comenzar.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-100 text-slate-600">
              <tr>
                {["Nombre", "Empresa", "Rubro", "Cargo", "Confirmación", "Sector", "Premiado"].map((h) => (
                  <th key={h} className="px-3 py-2 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lista.map((i) => (
                <tr key={i.id} className="border-t">
                  <td className="px-3 py-2 font-medium">{i.nombreApellido}</td>
                  <td className="px-3 py-2">{i.empresa}</td>
                  <td className="px-3 py-2">{i.rubro}</td>
                  <td className="px-3 py-2">{i.cargo ?? "—"}</td>
                  <td className="px-3 py-2">{i.confirmacion}</td>
                  <td className="px-3 py-2">{i.sector ?? "—"}</td>
                  <td className="px-3 py-2">
                    {i.premiado && <span className="rounded bg-red-600 px-2 py-0.5 text-xs font-bold text-white">PREMIADO</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
