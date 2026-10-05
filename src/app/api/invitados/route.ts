import type { NextRequest } from "next/server";
import { getDb } from "@/db/client";
import { respuestaErrorInterno, respuestaValidacion } from "@/lib/http";
import { filtrosInvitadosSchema, listarInvitados } from "@/lib/invitados/listar";

/** GET /api/invitados?q=&rubro=&sector=&confirmacion=&premiado=si|no&checkin=si|no */
export async function GET(request: NextRequest) {
  const filtros = filtrosInvitadosSchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams),
  );
  if (!filtros.success) return respuestaValidacion(filtros.error);

  try {
    const data = listarInvitados(getDb(), filtros.data);
    return Response.json({ data, total: data.length });
  } catch (error) {
    return respuestaErrorInterno("GET /api/invitados", error);
  }
}
