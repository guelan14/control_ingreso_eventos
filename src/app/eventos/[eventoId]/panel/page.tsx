import { notFound } from "next/navigation";
import { requerirSesion } from "@/lib/auth/dal";
import { buscarEvento } from "@/lib/eventos/buscar";
import { obtenerPanel } from "@/lib/panel/panel";
import { PanelEnVivo } from "./panel-en-vivo";

export default async function PanelEvento({ params }: PageProps<"/eventos/[eventoId]/panel">) {
  await requerirSesion("panel:ver");
  const encontrado = await buscarEvento((await params).eventoId);
  if (!encontrado) notFound();
  const { db, evento } = encontrado;

  // La primera carga viene con los datos ya armados; después la pantalla los pide cada 15 segundos.
  return (
    <PanelEnVivo
      eventoId={evento.id}
      nombreEvento={evento.nombre}
      usaRubros={evento.usaRubros}
      usaPremiados={evento.usaPremiados}
      inicial={await obtenerPanel(db, evento)}
    />
  );
}
