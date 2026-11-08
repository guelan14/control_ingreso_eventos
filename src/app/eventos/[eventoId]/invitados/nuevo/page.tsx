import Link from "next/link";
import { notFound } from "next/navigation";
import { requerirSesion } from "@/lib/auth/dal";
import { buscarEvento } from "@/lib/eventos/buscar";
import { FormularioAlta } from "../formularios";

export default async function NuevoInvitado({ params }: PageProps<"/eventos/[eventoId]/invitados/nuevo">) {
  await requerirSesion("invitados:editar");
  const encontrado = await buscarEvento((await params).eventoId);
  if (!encontrado) notFound();
  const { evento } = encontrado;

  return (
    <div className="max-w-2xl space-y-4">
      <Link href={`/eventos/${evento.id}/invitados`} className="text-sm text-slate-600 underline">
        ← Volver a la lista
      </Link>
      <h1 className="text-2xl font-bold">Nuevo invitado · {evento.nombre}</h1>
      <FormularioAlta
        config={{ eventoId: evento.id, usaRubros: evento.usaRubros, usaPremiados: evento.usaPremiados, rubros: evento.rubros }}
      />
    </div>
  );
}
