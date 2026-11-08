"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ZodError } from "zod";
import { autorizarAccion } from "@/lib/auth/dal";
import { buscarEvento } from "@/lib/eventos/buscar";
import {
  crearInvitado,
  DatosInvitadoError,
  edicionInvitadoSchema,
  editarInvitado,
  InvitadoDuplicadoError,
  nuevoInvitadoSchema,
} from "@/lib/invitados/gestion";

export type EstadoFormulario = {
  error?: string;
  /** Mensaje de error por campo, para mostrarlo debajo de cada input. */
  campos?: Record<string, string>;
  mensaje?: string;
  /** Lo que se envió: el formulario se vacía después de la acción y así se vuelve a cargar. */
  valores?: Record<string, string>;
};

const texto = (form: FormData, campo: string) => {
  const v = form.get(campo);
  return typeof v === "string" ? v : "";
};
const numero = (form: FormData, campo: string) => {
  const v = texto(form, campo);
  return v ? Number(v) : null;
};
const enviados = (form: FormData) =>
  Object.fromEntries([...form.entries()].filter(([k, v]) => !k.startsWith("$") && typeof v === "string")) as Record<string, string>;

function erroresDeCampos(error: ZodError): EstadoFormulario {
  const campos: Record<string, string> = {};
  for (const i of error.issues) campos[String(i.path[0] ?? "general")] ??= i.message;
  return { error: "Revise los datos marcados.", campos };
}

function errorConocido(error: unknown): EstadoFormulario | null {
  if (error instanceof DatosInvitadoError) return { error: error.message, campos: { [error.campo]: error.message } };
  if (error instanceof InvitadoDuplicadoError) return { error: error.message };
  return null;
}

export async function crearInvitadoAccion(_previo: EstadoFormulario, form: FormData): Promise<EstadoFormulario> {
  await autorizarAccion("invitados:editar");
  const encontrado = await buscarEvento(texto(form, "eventoId"));
  if (!encontrado) return { error: "Evento no encontrado." };
  const { db, evento } = encontrado;

  const datos = nuevoInvitadoSchema.safeParse({
    nombreApellido: texto(form, "nombreApellido"),
    empresa: texto(form, "empresa"),
    cargo: texto(form, "cargo"),
    dni: texto(form, "dni"),
    sector: texto(form, "sector"),
    confirmacion: texto(form, "confirmacion"),
    premiado: form.get("premiado") === "on",
    rubroId: evento.usaRubros ? numero(form, "rubroId") : null,
  });
  if (!datos.success) return { ...erroresDeCampos(datos.error), valores: enviados(form) };

  let id: number;
  try {
    ({ id } = await crearInvitado(db, evento, datos.data));
  } catch (error) {
    const conocido = errorConocido(error);
    if (conocido) return { ...conocido, valores: enviados(form) };
    throw error;
  }
  revalidatePath(`/eventos/${evento.id}`, "layout");
  redirect(`/eventos/${evento.id}/invitados/${id}?creado=1`);
}

export async function editarInvitadoAccion(_previo: EstadoFormulario, form: FormData): Promise<EstadoFormulario> {
  await autorizarAccion("invitados:editar");
  const encontrado = await buscarEvento(texto(form, "eventoId"));
  if (!encontrado) return { error: "Evento no encontrado." };
  const { db, evento } = encontrado;

  const cambios = edicionInvitadoSchema.safeParse({
    confirmacion: texto(form, "confirmacion"),
    sector: texto(form, "sector"),
    cargo: texto(form, "cargo"),
    ...(evento.usaPremiados && { premiado: form.get("premiado") === "on" }),
    ...(evento.usaRubros && { rubroId: numero(form, "rubroId") }),
  });
  if (!cambios.success) return { ...erroresDeCampos(cambios.error), valores: enviados(form) };

  try {
    const editado = await editarInvitado(db, evento, Number(texto(form, "invitadoId")), cambios.data);
    if (!editado) return { error: "Invitado no encontrado." };
  } catch (error) {
    const conocido = errorConocido(error);
    if (conocido) return { ...conocido, valores: enviados(form) };
    throw error;
  }
  revalidatePath(`/eventos/${evento.id}`, "layout");
  return { mensaje: "Cambios guardados.", valores: enviados(form) };
}
