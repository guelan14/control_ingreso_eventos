import Link from "next/link";
import { notFound } from "next/navigation";
import { requerirSesion } from "@/lib/auth/dal";
import { buscarEvento } from "@/lib/eventos/buscar";
import { listarCodigos } from "@/lib/qr/qr";

/** Tarea 23: un QR por invitado de la lista, para mandar antes del evento o imprimir. */
export default async function CodigosQr({ params }: PageProps<"/eventos/[eventoId]/qr">) {
  await requerirSesion("qr:generar");
  const encontrado = await buscarEvento((await params).eventoId);
  if (!encontrado) notFound();
  const { db, evento } = encontrado;
  const cantidad = (await listarCodigos(db, evento.id)).length;

  return (
    <div className="max-w-2xl space-y-5">
      <Link href={`/eventos/${evento.id}`} className="text-sm text-slate-600 underline">
        ← {evento.nombre}
      </Link>
      <h1 className="text-2xl font-bold">Códigos QR</h1>
      <p className="text-slate-700">
        Cada invitado de la lista tiene un código propio. El QR lleva solo ese código: no lleva el nombre ni otros
        datos, así que no expone a nadie si se reenvía. En la puerta se lee con la cámara desde la pantalla de
        check-in, y la búsqueda por nombre sigue funcionando para quien no lo traiga.
      </p>

      {cantidad === 0 ? (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900">
          Todavía no hay invitados en la lista. Importe el Excel primero.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <a
            href={`/api/eventos/${evento.id}/qr`}
            className="rounded-lg border bg-white p-5 shadow-sm hover:border-slate-400"
          >
            <h2 className="font-semibold">Descargar ZIP ({cantidad})</h2>
            <p className="text-sm text-slate-600">
              Una imagen por invitado y una planilla que dice qué archivo es de quién, para enviarlos por mail o
              WhatsApp.
            </p>
          </a>
          <Link
            href={`/eventos/${evento.id}/qr/imprimir`}
            className="rounded-lg border bg-white p-5 shadow-sm hover:border-slate-400"
          >
            <h2 className="font-semibold">Imprimir tarjetas</h2>
            <p className="text-sm text-slate-600">Hoja A4 con 8 tarjetas recortables: QR, nombre y empresa.</p>
          </Link>
        </div>
      )}
    </div>
  );
}
