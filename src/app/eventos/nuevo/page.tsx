import { requerirSesion } from "@/lib/auth/dal";
import { FormularioEvento } from "./formulario-evento";

export default async function NuevoEvento() {
  await requerirSesion("eventos:gestionar");

  return (
    <div className="max-w-xl space-y-4">
      <h1 className="text-2xl font-bold">Nuevo evento</h1>
      <FormularioEvento />
    </div>
  );
}
