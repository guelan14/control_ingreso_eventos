import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { crearDbPglite, type Db } from "@/db/create-db";
import { checkins, invitados } from "@/db/schema";
import { crearUsuario } from "@/lib/auth/usuarios";
import { altaPuertaSchema, EMPRESA_NO_INDICADA, registrarAltaEnPuerta, type AltaPuerta } from "@/lib/checkin/alta-puerta";
import { registrarCheckin } from "@/lib/checkin/registrar";
import { crearEvento, obtenerEvento, type EventoConRubros } from "@/lib/eventos/eventos";
import { exportarInvitados } from "@/lib/exportar/exportar";
import { importarInvitados } from "@/lib/importacion/importar";
import { crearLibroInvitados, FILAS_EJEMPLO, OPCIONES_POR_DEFECTO } from "@/lib/importacion/plantilla";
import { RUBROS_SUGERIDOS } from "@/lib/invitados/constants";
import { listarInvitados } from "@/lib/invitados/listar";
import { obtenerPanel } from "@/lib/panel/panel";
import { extraerCodigo } from "@/lib/qr/codigo";
import { buscarPorQr, listarCodigos, qrPng, zipDeQrs } from "@/lib/qr/qr";

let db: Db;
let evento: EventoConRubros;
let operador: { usuarioId: number; dispositivo: string };

beforeAll(async () => {
  db = await crearDbPglite();
}, 60_000);

async function nuevoEvento(nombre = "Aniversario 2027") {
  const { id } = await crearEvento(db, {
    nombre,
    fecha: "2027-04-15",
    usaRubros: true,
    usaPremiados: true,
    rubros: [...RUBROS_SUGERIDOS],
  });
  const e = (await obtenerEvento(db, id))!;
  await importarInvitados(db, e, await crearLibroInvitados(FILAS_EJEMPLO, OPCIONES_POR_DEFECTO), { confirmar: true });
  return e;
}

beforeEach(async () => {
  await db.execute(sql`truncate eventos, rubros, invitados, checkins, usuarios, sesiones restart identity cascade`);
  evento = await nuevoEvento();
  const { usuario } = await crearUsuario(db, { usuario: "puerta1", nombre: "Ana Recepción", rol: "recepcion" });
  operador = { usuarioId: usuario.id, dispositivo: "Celular de prueba" };
});

let n = 0;
const alta = (extra: Partial<Record<keyof AltaPuerta, string>> = {}): AltaPuerta =>
  altaPuertaSchema.parse({
    nombreApellido: "Carlos González",
    acompanaA: "María González (premiada), esposo",
    clave: `clave-alta-${++n}`.padEnd(20, "x"),
    ...extra,
  });
const hora = new Date("2027-04-15T23:10:00Z");

describe("alta en la puerta (D6)", () => {
  it("crea al invitado marcado como 'puerta' y registra su ingreso en el mismo paso", async () => {
    const r = await registrarAltaEnPuerta(db, evento.id, alta(), operador, hora);
    expect(r.estado).toBe("registrado");
    if (r.estado !== "registrado") return;
    expect(r.reintento).toBe(false);
    expect(r.invitado).toMatchObject({
      nombreApellido: "Carlos González",
      empresa: EMPRESA_NO_INDICADA,
      origen: "puerta",
      acompanaA: "María González (premiada), esposo",
      premiado: false,
      checkinEn: hora,
    });
    const historial = await db.select().from(checkins).where(eq(checkins.invitadoId, r.invitado.id));
    expect(historial).toHaveLength(1);
    expect(historial[0]).toMatchObject({ tipo: "ingreso", usuarioId: operador.usuarioId, registradoEn: hora });
  });

  it("un reintento con la misma clave no crea otra persona", async () => {
    const datos = alta();
    await registrarAltaEnPuerta(db, evento.id, datos, operador, hora);
    const r = await registrarAltaEnPuerta(db, evento.id, datos, operador, new Date("2027-04-15T23:30:00Z"));
    expect(r).toMatchObject({ estado: "registrado", reintento: true, invitado: { checkinEn: hora } });
    expect(await db.select().from(invitados).where(eq(invitados.origen, "puerta"))).toHaveLength(1);
  });

  it("si la persona ya estaba cargada devuelve 'existe' y no la duplica", async () => {
    // María está en la lista con DNI 28456789.
    const porDni = await registrarAltaEnPuerta(db, evento.id, alta({ nombreApellido: "Maria Gonzalez", dni: "28.456.789" }), operador, hora);
    expect(porDni).toMatchObject({ estado: "existe", invitado: { nombreApellido: "María González", checkinEn: null } });

    // Juan no tiene DNI: se reconoce por nombre + empresa.
    const porNombre = await registrarAltaEnPuerta(
      db,
      evento.id,
      alta({ nombreApellido: "juan  perez", empresa: "Distribuidora Posadas" }),
      operador,
      hora,
    );
    expect(porNombre).toMatchObject({ estado: "existe", invitado: { nombreApellido: "Juan Pérez" } });
    expect(await db.select().from(checkins)).toHaveLength(0);
  });

  it("dos acompañantes con el mismo nombre y sin empresa: el segundo cae en 'existe'", async () => {
    await registrarAltaEnPuerta(db, evento.id, alta(), operador, hora);
    const r = await registrarAltaEnPuerta(db, evento.id, alta(), operador, hora);
    expect(r.estado).toBe("existe");
  });

  it("exige nombre y a quién acompaña", () => {
    expect(altaPuertaSchema.safeParse({ nombreApellido: "Carlos", clave: "x".repeat(20) }).success).toBe(false);
    expect(altaPuertaSchema.safeParse({ nombreApellido: "Carlos", acompanaA: "Ma", clave: "x".repeat(20), extra: 1 }).success).toBe(false);
  });

  it("D7: suma a ingresados pero no a invitaciones ni confirmados", async () => {
    const antes = await obtenerPanel(db, evento);
    await registrarAltaEnPuerta(db, evento.id, alta(), operador, hora);
    const despues = await obtenerPanel(db, evento);
    expect(despues.totales).toEqual({ ...antes.totales, ingresados: antes.totales.ingresados + 1, sinLista: 1 });
    expect(despues.ultimos[0]).toMatchObject({ nombreApellido: "Carlos González", origen: "puerta" });
  });

  it("aparece en la lista de invitados con su origen", async () => {
    await registrarAltaEnPuerta(db, evento.id, alta(), operador, hora);
    const { data } = await listarInvitados(db, evento.id, { q: "Carlos" });
    expect(data).toEqual([expect.objectContaining({ origen: "puerta", acompanaA: "María González (premiada), esposo" })]);
  });
});

describe("códigos QR (tarea 23)", () => {
  it("cada invitado tiene un código distinto de 16 caracteres, también los importados antes", async () => {
    const codigos = (await db.select({ codigo: invitados.codigo }).from(invitados)).map((f) => f.codigo);
    expect(codigos).toHaveLength(3);
    for (const c of codigos) expect(c).toMatch(/^[0-9A-F]{16}$/);
    expect(new Set(codigos).size).toBe(3);
  });

  it("extraerCodigo acepta el código solo, en minúsculas o al final de una dirección", () => {
    expect(extraerCodigo("0123456789ABCDEF")).toBe("0123456789ABCDEF");
    expect(extraerCodigo("  0123456789abcdef \n")).toBe("0123456789ABCDEF");
    expect(extraerCodigo("https://eventos.ejemplo.com/q/0123456789ABCDEF")).toBe("0123456789ABCDEF");
    expect(extraerCodigo("hola")).toBeNull();
    expect(extraerCodigo("0123456789ABCDEG")).toBeNull();
    expect(extraerCodigo("")).toBeNull();
  });

  it("buscarPorQr encuentra al invitado, avisa si es de otro evento y rechaza códigos desconocidos", async () => {
    const [maria] = await db.select().from(invitados).where(eq(invitados.nombreApellido, "María González"));
    expect(await buscarPorQr(db, evento.id, maria.codigo)).toMatchObject({
      estado: "encontrado",
      invitado: { id: maria.id, premiado: true, origen: "lista" },
    });

    const otro = await nuevoEvento("Cena de fin de año");
    expect(await buscarPorQr(db, otro.id, maria.codigo)).toEqual({ estado: "otro_evento", evento: "Aniversario 2027" });
    expect(await buscarPorQr(db, evento.id, "FFFFFFFFFFFFFFFF")).toEqual({ estado: "no_encontrado" });
    expect(await buscarPorQr(db, evento.id, "cualquier cosa")).toEqual({ estado: "no_encontrado" });
  });

  it("el PNG es una imagen válida", async () => {
    const png = await qrPng("0123456789ABCDEF");
    expect([...png.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });

  it("los de la puerta no tienen QR para enviar", async () => {
    await registrarAltaEnPuerta(db, evento.id, alta(), operador, hora);
    expect(await listarCodigos(db, evento.id)).toHaveLength(3);
  });

  it("el ZIP trae un PNG por invitado y la planilla que los relaciona", async () => {
    const zip = await JSZip.loadAsync(await zipDeQrs(db, evento));
    const pngs = Object.keys(zip.files).filter((f) => f.endsWith(".png"));
    expect(pngs).toHaveLength(3);
    // La barra de "Sede: Oberá" no puede quedar en el nombre del archivo.
    expect(pngs.some((f) => f.startsWith("qr/María González - Yerbatera del Alto Uruguay - Sede Oberá ("))).toBe(true);

    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(await zip.file("codigos.xlsx")!.async("arraybuffer"));
    const hoja = libro.worksheets[0];
    expect(hoja.rowCount).toBe(4);
    const encabezados = (hoja.getRow(1).values as unknown[]).slice(1);
    expect(encabezados).toContain("codigo");
    const archivos = hoja.getColumn(encabezados.indexOf("archivo") + 1).values.slice(2);
    expect(archivos.sort()).toEqual(pngs.sort());
  });
});

describe("exportar a Excel (tarea 24)", () => {
  async function leer(buffer: ArrayBuffer) {
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(buffer);
    const hoja = libro.worksheets[0];
    const encabezados = (hoja.getRow(1).values as unknown[]).slice(1) as string[];
    const filas: Record<string, unknown>[] = [];
    hoja.eachRow((fila, i) => {
      if (i === 1) return;
      const v = (fila.values as unknown[]).slice(1);
      filas.push(Object.fromEntries(encabezados.map((e, j) => [e, v[j] ?? null])));
    });
    return { nombre: hoja.name, encabezados, filas };
  }

  it("presentes: solo los que ingresaron, en orden de llegada, con hora de Argentina", async () => {
    const [juan] = await db.select().from(invitados).where(eq(invitados.nombreApellido, "Juan Pérez"));
    await registrarAltaEnPuerta(db, evento.id, alta(), operador, new Date("2027-04-15T23:20:00Z"));
    await registrarCheckin(db, evento.id, { invitadoId: juan.id, clave: "clave-exportar-1".padEnd(20, "x"), corregir: false }, operador, hora);

    const x = await leer(await exportarInvitados(db, evento, "presentes"));
    expect(x.nombre).toBe("Presentes");
    expect(x.filas.map((f) => f["Nombre y apellido"])).toEqual(["Juan Pérez", "Carlos González"]);
    expect(x.filas[0]).toMatchObject({ Ingreso: "15/04/2027 20:10:00", "En lista": "SI" });
    expect(x.filas[1]).toMatchObject({ "En lista": "NO", "Acompaña a": "María González (premiada), esposo" });
  });

  it("todos: la lista completa con las columnas que usa el evento", async () => {
    const x = await leer(await exportarInvitados(db, evento, "todos"));
    expect(x.filas).toHaveLength(3);
    expect(x.encabezados).toEqual(expect.arrayContaining(["Rubro", "Premiado", "Confirmación"]));

    const sinExtras = await obtenerEvento(db, (await crearEvento(db, { nombre: "Charla", fecha: "2027-05-01", usaRubros: false, usaPremiados: false, rubros: [] })).id);
    const y = await leer(await exportarInvitados(db, sinExtras!, "todos"));
    expect(y.encabezados).not.toContain("Rubro");
    expect(y.encabezados).not.toContain("Premiado");
    expect(y.filas).toHaveLength(0);
  });
});

describe("formato de horas", () => {
  it("siempre 24 horas y en hora de Argentina, sin 'p. m.'", async () => {
    const { formatearFechaHora, formatearHora, formatearHoraExacta } = await import("@/lib/fechas");
    const noche = new Date("2027-04-16T02:05:09Z"); // 23:05:09 del 15 en Argentina
    expect(formatearHora(noche)).toBe("23:05");
    expect(formatearHoraExacta(noche)).toBe("23:05:09");
    expect(formatearFechaHora(noche)).toBe("15/04/2027 23:05");
    expect(formatearHora("2027-04-15T03:00:00Z")).toBe("00:00");
  });
});
