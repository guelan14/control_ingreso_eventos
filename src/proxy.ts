import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_SESION } from "@/lib/auth/cookie";

const RUTAS_PUBLICAS = ["/login", "/api/salud"];

/**
 * Control rápido antes de cada request: sin cookie de sesión no se entra. No consulta la base;
 * la sesión y los permisos se validan de verdad en src/lib/auth/dal.ts.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const esPublica = RUTAS_PUBLICAS.some((r) => pathname === r || pathname.startsWith(`${r}/`));
  if (esPublica || request.cookies.has(COOKIE_SESION)) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return Response.json({ error: { mensaje: "Inicie sesión para continuar." } }, { status: 401 });
  }
  const login = new URL("/login", request.url);
  if (pathname !== "/") login.searchParams.set("desde", pathname + search);
  return NextResponse.redirect(login);
}

export const config = {
  // Todo menos los archivos internos de Next y los estáticos de /public.
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:xlsx|png|jpg|jpeg|svg|ico|webp)$).*)"],
};
