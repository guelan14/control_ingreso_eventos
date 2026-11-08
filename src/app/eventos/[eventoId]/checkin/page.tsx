import { notFound } from "next/navigation";
import { requerirSesion } from "@/lib/auth/dal";
import { buscarEvento } from "@/lib/eventos/buscar";
import { PantallaCheckin } from "./pantalla-checkin";

export default async function Checkin({ params }: PageProps<"/eventos/[eventoId]/checkin">) {
  await requerirSesion("checkin:registrar");
  const encontrado = await buscarEvento((await params).eventoId);
  if (!encontrado) notFound();

  return <PantallaCheckin eventoId={encontrado.evento.id} nombreEvento={encontrado.evento.nombre} />;
}
