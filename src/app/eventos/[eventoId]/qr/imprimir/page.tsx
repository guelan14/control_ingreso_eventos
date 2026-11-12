import Link from "next/link";
import { notFound } from "next/navigation";
import { requerirSesion } from "@/lib/auth/dal";
import { buscarEvento } from "@/lib/eventos/buscar";
import { formatearFecha } from "@/lib/fechas";
import { listarCodigos, qrSvg } from "@/lib/qr/qr";
import { BotonImprimir } from "./boton-imprimir";

/** Tarjetas para imprimir (2 x 4 por hoja A4). La barra de arriba no sale en el papel. */
export default async function ImprimirQr({ params }: PageProps<"/eventos/[eventoId]/qr/imprimir">) {
  await requerirSesion("qr:generar");
  const encontrado = await buscarEvento((await params).eventoId);
  if (!encontrado) notFound();
  const { db, evento } = encontrado;
  const filas = await listarCodigos(db, evento.id);
  const tarjetas = await Promise.all(filas.map(async (f) => ({ ...f, svg: await qrSvg(f.codigo) })));

  return (
    <div className="space-y-4">
      <style>{`
        @page { size: A4; margin: 10mm; }
        @media print {
          body > header, nav, .no-imprimir { display: none !important; }
          body { background: white !important; }
          main { padding: 0 !important; max-width: none !important; }
        }
      `}</style>

      <div className="no-imprimir flex flex-wrap items-center justify-between gap-3">
        <Link href={`/eventos/${evento.id}/qr`} className="text-sm text-slate-600 underline">
          ← Códigos QR
        </Link>
        <p className="text-sm text-slate-600">{tarjetas.length} tarjetas</p>
        <BotonImprimir />
      </div>

      <div className="grid grid-cols-2 gap-[6mm]">
        {tarjetas.map((t) => (
          <article
            key={t.id}
            className="flex break-inside-avoid items-center gap-3 rounded-lg border border-dashed border-slate-400 bg-white p-3"
            style={{ height: "62mm" }}
          >
            {/* SVG armado en el servidor a partir de un código hexadecimal: no lleva texto cargado por usuarios. */}
            <div className="w-[38mm] shrink-0" dangerouslySetInnerHTML={{ __html: t.svg }} />
            <div className="min-w-0 space-y-1">
              <p className="text-xs uppercase tracking-wide text-slate-500">{evento.nombre}</p>
              <p className="text-xs text-slate-500">{formatearFecha(evento.fecha)}</p>
              <p className="text-base font-bold leading-tight">{t.nombreApellido}</p>
              <p className="text-sm leading-tight text-slate-700">{t.empresa}</p>
              {t.sector && <p className="text-sm font-medium">Sector {t.sector}</p>}
              <p className="font-mono text-[10px] text-slate-400">{t.codigo}</p>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
