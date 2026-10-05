import { FormularioImportacion } from "./formulario-importacion";

export default function Importar() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Importar invitados</h1>
        <p className="text-slate-600">
          Suba un .xlsx con una hoja <b>Invitados</b>. Primero se valida y se muestra un reporte; los datos
          solo se graban al confirmar. Reimportar actualiza por nombre + empresa sin duplicar ni borrar check-ins.
        </p>
        <a href="/plantilla_invitados.xlsx" download className="mt-2 inline-block text-sm font-medium text-blue-700 underline">
          Descargar plantilla Excel
        </a>
      </div>
      <FormularioImportacion />
    </div>
  );
}
