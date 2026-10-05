import Link from "next/link";

const MODULOS = [
  { href: "/importar", titulo: "Importar invitados", detalle: "Cargar el Excel con validación previa", listo: true },
  { href: "/invitados", titulo: "Lista de invitados", detalle: "Ver los invitados cargados", listo: true },
  { href: "#", titulo: "Check-in en puerta", detalle: "Semana 2", listo: false },
  { href: "#", titulo: "Panel en tiempo real", detalle: "Semana 3", listo: false },
];

export default function Inicio() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {MODULOS.map((m) =>
        m.listo ? (
          <Link key={m.titulo} href={m.href} className="rounded-lg border bg-white p-5 shadow-sm hover:border-slate-400">
            <h2 className="font-semibold">{m.titulo}</h2>
            <p className="text-sm text-slate-600">{m.detalle}</p>
          </Link>
        ) : (
          <div key={m.titulo} className="rounded-lg border border-dashed p-5 text-slate-400">
            <h2 className="font-semibold">{m.titulo}</h2>
            <p className="text-sm">{m.detalle}</p>
          </div>
        ),
      )}
    </div>
  );
}
