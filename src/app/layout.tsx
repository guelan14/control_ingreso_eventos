import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Control de Ingreso",
  description: "Check-in de invitados y alerta de premiados para eventos",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

const NAVEGACION = [
  { href: "/importar", label: "Importar" },
  { href: "/invitados", label: "Invitados" },
];

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${geistSans.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-slate-50 text-slate-900">
        <header className="bg-slate-900 text-white">
          <nav className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
            <Link href="/" className="font-semibold">
              Control de Ingreso
            </Link>
            {NAVEGACION.map((item) => (
              <Link key={item.href} href={item.href} className="text-sm text-slate-300 hover:text-white">
                {item.label}
              </Link>
            ))}
          </nav>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
