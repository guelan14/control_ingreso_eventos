import type { NextRequest } from "next/server";
import { autorizarApi } from "@/lib/auth/dal";
import { buscarEvento } from "@/lib/eventos/buscar";
import { leerJson, respuestaError, respuestaErrorInterno, respuestaValidacion } from "@/lib/http";
import {
  crearInvitado,
  DatosInvitadoError,
  InvitadoDuplicadoError,
  nuevoInvitadoSchema,
  obtenerInvitado,
} from "@/lib/invitados/gestion";
import { filtrosInvitadosSchema, listarInvitados } from "@/lib/invitados/listar";

/**
 * GET /api/eventos/:id/invitados
 *   ?q=&rubroId=&sector=&confirmacion=&premiado=si|no&checkin=si|no&pagina=1&porPagina=50
 */
export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/api/eventos/[eventoId]/invitados">,
) {
  const sesion = await autorizarApi(request, "invitados:ver");
  if (sesion instanceof Response) return sesion;
  const filtros = filtrosInvitadosSchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!filtros.success) return respuestaValidacion(filtros.error);

  try {
    const encontrado = await buscarEvento((await ctx.params).eventoId);
    if (!encontrado) return respuestaError(404, "Evento no encontrado.");
    return Response.json(await listarInvitados(encontrado.db, encontrado.evento.id, filtros.data));
  } catch (error) {
    return respuestaErrorInterno("GET /api/eventos/:id/invitados", error);
  }
}

/**
 * POST /api/eventos/:id/invitados — alta manual.
 *   { nombreApellido, empresa, confirmacion, rubroId?, premiado?, cargo?, dni?, sector? }
 */
export async function POST(request: Request, ctx: RouteContext<"/api/eventos/[eventoId]/invitados">) {
  const sesion = await autorizarApi(request, "invitados:editar");
  if (sesion instanceof Response) return sesion;
  const cuerpo = await leerJson(request);
  if (cuerpo instanceof Response) return cuerpo;
  const datos = nuevoInvitadoSchema.safeParse(cuerpo);
  if (!datos.success) return respuestaValidacion(datos.error);

  try {
    const encontrado = await buscarEvento((await ctx.params).eventoId);
    if (!encontrado) return respuestaError(404, "Evento no encontrado.");
    const { id } = await crearInvitado(encontrado.db, encontrado.evento, datos.data);
    return Response.json(await obtenerInvitado(encontrado.db, encontrado.evento.id, id), { status: 201 });
  } catch (error) {
    if (error instanceof DatosInvitadoError) return respuestaError(400, error.message, [{ campo: error.campo, mensaje: error.message }]);
    if (error instanceof InvitadoDuplicadoError) return respuestaError(409, error.message);
    return respuestaErrorInterno("POST /api/eventos/:id/invitados", error);
  }
}
