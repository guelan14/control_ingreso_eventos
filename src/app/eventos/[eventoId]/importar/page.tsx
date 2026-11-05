import { notFound } from "next/navigation";
import { buscarEvento } from "@/lib/eventos/buscar";
import { FormularioImportacion } from "./formulario-importacion";

export default async function Importar({ params }: PageProps<"/eventos/[eventoId]/importar">) {
  const encontrado = await buscarEvento((await params).eventoId);
  if (!encontrado) notFound();
  const { evento } = encontrado;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Importar invitados · {evento.nombre}</h1>
        <p className="text-slate-600">
          Suba un .xlsx con una hoja <b>Invitados</b>. Primero se valida y se muestra un reporte; los datos
          solo se graban al confirmar. Reimportar actualiza a los invitados existentes (por DNI, o por nombre
          + empresa) sin duplicar ni borrar check-ins.
        </p>
        <a
          href={`/api/eventos/${evento.id}/plantilla`}
          download
          className="mt-2 inline-block text-sm font-medium text-blue-700 underline"
        >
          Descargar plantilla Excel de este evento
        </a>
      </div>
      <FormularioImportacion eventoId={evento.id} />
    </div>
  );
}
