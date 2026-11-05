import Link from "next/link";
import { requerirSesion } from "@/lib/auth/dal";
import { NOMBRE_ROL } from "@/lib/auth/roles";

export default async function SinPermiso() {
  const sesion = await requerirSesion();

  return (
    <div className="space-y-3 pt-8">
      <h1 className="text-2xl font-bold">Sin permiso</h1>
      <p className="text-slate-600">
        Su usuario ({NOMBRE_ROL[sesion.rol]}) no tiene acceso a esa pantalla. Si lo necesita, pídaselo a un
        administrador.
      </p>
      <Link href="/" className="inline-block text-sm font-medium text-blue-700 underline">
        Volver a eventos
      </Link>
    </div>
  );
}
