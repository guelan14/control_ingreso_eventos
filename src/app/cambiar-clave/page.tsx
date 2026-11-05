import { requerirSesion } from "@/lib/auth/dal";
import { FormularioClave } from "./formulario-clave";

export default async function CambiarClave() {
  const sesion = await requerirSesion(undefined, { cambioDeClave: true });

  return (
    <div className="mx-auto max-w-sm space-y-4 pt-8">
      <h1 className="text-2xl font-bold">Cambiar contraseña</h1>
      {sesion.debeCambiarClave && (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Está usando una contraseña temporal. Elija una propia para continuar.
        </p>
      )}
      <FormularioClave />
      <p className="text-sm text-slate-600">Al cambiarla se cierran sus sesiones en otros dispositivos.</p>
    </div>
  );
}
