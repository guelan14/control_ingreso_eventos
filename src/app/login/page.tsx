import { redirect } from "next/navigation";
import { destinoSeguro } from "@/lib/auth/cookie";
import { obtenerSesion } from "@/lib/auth/dal";
import { FormularioLogin } from "./formulario-login";

export default async function Login({ searchParams }: PageProps<"/login">) {
  if (await obtenerSesion()) redirect("/");
  const { desde } = await searchParams;

  return (
    <div className="mx-auto max-w-sm space-y-4 pt-8">
      <h1 className="text-2xl font-bold">Ingresar</h1>
      <FormularioLogin desde={destinoSeguro(desde)} />
      <p className="text-sm text-slate-600">¿Olvidó la contraseña? Pídale a un administrador que la restablezca.</p>
    </div>
  );
}
