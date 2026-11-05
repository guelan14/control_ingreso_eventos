import type { Metadata, Viewport } from "next";
// Fuente incluida en el paquete `geist`: el build no necesita descargar nada de Google Fonts.
import { GeistSans } from "geist/font/sans";
import Link from "next/link";
import { obtenerSesion } from "@/lib/auth/dal";
import { NOMBRE_ROL, puede } from "@/lib/auth/roles";
import { salir } from "./acciones-sesion";
import "./globals.css";

export const metadata: Metadata = {
  title: "Control de Ingreso",
  description: "Check-in de invitados y alerta de premiados para eventos",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const sesion = await obtenerSesion();
  const enlace = "text-sm text-slate-300 hover:text-white";

  return (
    <html lang="es" className={`${GeistSans.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-slate-50 text-slate-900">
        <header className="bg-slate-900 text-white">
          <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
            <Link href="/" className="font-semibold">
              Control de Ingreso
            </Link>
            {sesion && !sesion.debeCambiarClave && (
              <>
                <Link href="/" className={enlace}>
                  Eventos
                </Link>
                {puede(sesion.rol, "usuarios:gestionar") && (
                  <Link href="/usuarios" className={enlace}>
                    Usuarios
                  </Link>
                )}
              </>
            )}
            {sesion && (
              <div className="ml-auto flex items-center gap-4 text-sm">
                <span className="text-slate-300">
                  {sesion.nombre} · {NOMBRE_ROL[sesion.rol]}
                </span>
                <Link href="/cambiar-clave" className={enlace}>
                  Contraseña
                </Link>
                <form action={salir}>
                  <button className="rounded-md border border-slate-600 px-3 py-1 hover:bg-slate-800">Salir</button>
                </form>
              </div>
            )}
          </nav>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
