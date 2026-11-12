import { and, asc, eq } from "drizzle-orm";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import QRCode from "qrcode";
import type { Db } from "@/db/create-db";
import { eventos, invitados, rubros } from "@/db/schema";
import { invitadoParaCheckin, type InvitadoCheckin } from "@/lib/checkin/registrar";
import type { EventoConRubros } from "@/lib/eventos/eventos";
import { extraerCodigo } from "./codigo";

/**
 * El QR lleva solo el código del invitado (16 caracteres al azar). No lleva datos personales ni una
 * dirección web: si alguien lo escanea con la cámara del celular, no ve nada de nadie.
 */
const OPCIONES = { errorCorrectionLevel: "M", margin: 2 } as const;

export function qrPng(codigo: string, ancho = 512): Promise<Buffer> {
  return QRCode.toBuffer(codigo, { ...OPCIONES, width: ancho, type: "png" });
}

export function qrSvg(codigo: string): Promise<string> {
  return QRCode.toString(codigo, { ...OPCIONES, type: "svg" });
}

export type ResultadoQr =
  | { estado: "encontrado"; invitado: InvitadoCheckin }
  | { estado: "otro_evento"; evento: string }
  | { estado: "no_encontrado" };

/** Invitado a partir de lo leído por la cámara. Avisa si el QR es de otro evento. */
export async function buscarPorQr(db: Db, eventoId: number, leido: string): Promise<ResultadoQr> {
  const codigo = extraerCodigo(leido);
  if (!codigo) return { estado: "no_encontrado" };
  const [fila] = await db
    .select({ id: invitados.id, eventoId: invitados.eventoId, evento: eventos.nombre })
    .from(invitados)
    .innerJoin(eventos, eq(eventos.id, invitados.eventoId))
    .where(eq(invitados.codigo, codigo));
  if (!fila) return { estado: "no_encontrado" };
  if (fila.eventoId !== eventoId) return { estado: "otro_evento", evento: fila.evento };
  return { estado: "encontrado", invitado: (await invitadoParaCheckin(db, eventoId, fila.id))! };
}

/** Invitados de la lista con su código, para exportar e imprimir. */
export function listarCodigos(db: Db, eventoId: number) {
  return db
    .select({
      id: invitados.id,
      nombreApellido: invitados.nombreApellido,
      empresa: invitados.empresa,
      sector: invitados.sector,
      rubro: rubros.nombre,
      confirmacion: invitados.confirmacion,
      codigo: invitados.codigo,
    })
    .from(invitados)
    .leftJoin(rubros, eq(rubros.id, invitados.rubroId))
    .where(and(eq(invitados.eventoId, eventoId), eq(invitados.origen, "lista")))
    .orderBy(asc(invitados.nombreApellido), asc(invitados.id));
}

/** "María González / Sede: Oberá" -> "María González - Sede Oberá": válido en Windows, Mac y WhatsApp. */
function nombreDeArchivo(texto: string) {
  return texto.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}

/**
 * ZIP para enviar los QR por mail o WhatsApp (D9): un PNG por invitado y una planilla que dice qué
 * archivo es de quién, para combinar correspondencia.
 */
export async function zipDeQrs(db: Db, evento: EventoConRubros): Promise<Uint8Array> {
  const filas = await listarCodigos(db, evento.id);
  const zip = new JSZip();
  const carpeta = zip.folder("qr")!;

  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet("Códigos QR");
  hoja.columns = [
    { header: "nombre_apellido", key: "nombre", width: 32 },
    { header: "empresa", key: "empresa", width: 32 },
    ...(evento.usaRubros ? [{ header: "rubro", key: "rubro", width: 22 }] : []),
    { header: "sector", key: "sector", width: 10 },
    { header: "confirmacion", key: "confirmacion", width: 14 },
    { header: "codigo", key: "codigo", width: 20 },
    { header: "archivo", key: "archivo", width: 48 },
  ];
  hoja.getRow(1).font = { bold: true };

  for (const f of filas) {
    const archivo = `${nombreDeArchivo(`${f.nombreApellido} - ${f.empresa}`)} (${f.id}).png`;
    carpeta.file(archivo, await qrPng(f.codigo));
    hoja.addRow({ nombre: f.nombreApellido, empresa: f.empresa, rubro: f.rubro, sector: f.sector, confirmacion: f.confirmacion, codigo: f.codigo, archivo: `qr/${archivo}` });
  }
  zip.file("codigos.xlsx", new Uint8Array(await libro.xlsx.writeBuffer()));
  return zip.generateAsync({ type: "uint8array", compression: "STORE" });
}
