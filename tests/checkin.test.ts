import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { crearDbPglite, type Db } from "@/db/create-db";
import { checkins, invitados } from "@/db/schema";
import { crearUsuario } from "@/lib/auth/usuarios";
import { pedidoCheckinSchema, registrarCheckin, type PedidoCheckin } from "@/lib/checkin/registrar";
import { crearEvento, obtenerEvento } from "@/lib/eventos/eventos";
import { importarInvitados } from "@/lib/importacion/importar";
import { crearLibroInvitados, FILAS_EJEMPLO, OPCIONES_POR_DEFECTO } from "@/lib/importacion/plantilla";
import { RUBROS_SUGERIDOS } from "@/lib/invitados/constants";

let db: Db;
let eventoId: number;
let operador: { usuarioId: number; dispositivo: string };
let maria: number; // premiada
let juan: number;

beforeAll(async () => {
  db = await crearDbPglite();
}, 60_000);

async function nuevoEventoConInvitados() {
  const { id } = await crearEvento(db, {
    nombre: "Aniversario 2027",
    fecha: "2027-04-15",
    usaRubros: true,
    usaPremiados: true,
    rubros: [...RUBROS_SUGERIDOS],
  });
  const evento = (await obtenerEvento(db, id))!;
  await importarInvitados(db, evento, await crearLibroInvitados(FILAS_EJEMPLO, OPCIONES_POR_DEFECTO), { confirmar: true });
  return id;
}

beforeEach(async () => {
  await db.execute(sql`truncate eventos, rubros, invitados, checkins, usuarios, sesiones restart identity cascade`);
  eventoId = await nuevoEventoConInvitados();
  const { usuario } = await crearUsuario(db, { usuario: "puerta1", nombre: "Ana Recepción", rol: "recepcion" });
  operador = { usuarioId: usuario.id, dispositivo: "Celular de prueba" };
  const lista = await db.select().from(invitados);
  maria = lista.find((i) => i.nombreApellido === "María González")!.id;
  juan = lista.find((i) => i.nombreApellido === "Juan Pérez")!.id;
});

let contador = 0;
const pedido = (invitadoId: number, extra: Partial<PedidoCheckin> = {}): PedidoCheckin => ({
  invitadoId,
  clave: `clave-de-prueba-${++contador}`.padEnd(20, "x"),
  corregir: false,
  ...extra,
});

const hora1 = new Date("2027-04-15T23:05:00Z");
const hora2 = new Date("2027-04-15T23:40:00Z");

describe("registrarCheckin", () => {
  it("graba el ingreso con la hora, quién lo registró y desde qué dispositivo", async () => {
    const r = await registrarCheckin(db, eventoId, pedido(juan), operador, hora1);
    expect(r).toMatchObject({ estado: "registrado", reintento: false, horaAnterior: null });
    expect(r.estado === "registrado" && r.invitado).toMatchObject({ nombreApellido: "Juan Pérez", checkinEn: hora1 });

    const [fila] = await db.select().from(checkins);
    expect(fila).toMatchObject({ invitadoId: juan, tipo: "ingreso", registradoEn: hora1, usuarioId: operador.usuarioId, dispositivo: "Celular de prueba" });
    const [inv] = await db.select().from(invitados).where(eq(invitados.id, juan));
    expect(inv.checkinEn).toEqual(hora1);
  });

  it("devuelve los datos para la alerta de premiado", async () => {
    const r = await registrarCheckin(db, eventoId, pedido(maria), operador, hora1);
    expect(r.estado === "registrado" && r.invitado).toMatchObject({ premiado: true, sector: "A", rubro: "Agroindustria" });
  });

  it("un doble ingreso avisa la hora anterior y no la sobreescribe", async () => {
    await registrarCheckin(db, eventoId, pedido(juan), operador, hora1);
    const r = await registrarCheckin(db, eventoId, pedido(juan), operador, hora2);
    expect(r).toMatchObject({ estado: "ya_ingresado" });
    expect(r.estado === "ya_ingresado" && r.invitado.checkinEn).toEqual(hora1);
    expect(await db.$count(checkins)).toBe(1);
  });

  it("con confirmación explícita corrige la hora y deja registro de la anterior", async () => {
    await registrarCheckin(db, eventoId, pedido(juan), operador, hora1);
    const r = await registrarCheckin(db, eventoId, pedido(juan, { corregir: true }), operador, hora2);
    expect(r).toMatchObject({ estado: "registrado", horaAnterior: hora1 });

    const filas = await db.select().from(checkins).orderBy(checkins.id);
    expect(filas.map((f) => f.tipo)).toEqual(["ingreso", "correccion"]);
    expect(filas[1].horaAnterior).toEqual(hora1);
    const [inv] = await db.select().from(invitados).where(eq(invitados.id, juan));
    expect(inv.checkinEn).toEqual(hora2);
  });

  it("un reintento con la misma clave no registra dos veces (corte de red)", async () => {
    const p = pedido(juan);
    await registrarCheckin(db, eventoId, p, operador, hora1);
    const r = await registrarCheckin(db, eventoId, p, operador, hora2);
    expect(r).toMatchObject({ estado: "registrado", reintento: true });
    expect(r.estado === "registrado" && r.invitado.checkinEn).toEqual(hora1);
    expect(await db.$count(checkins)).toBe(1);
  });

  it("dos dispositivos registrando a la misma persona a la vez: entra uno solo", async () => {
    const resultados = await Promise.all([
      registrarCheckin(db, eventoId, pedido(juan), operador, hora1),
      registrarCheckin(db, eventoId, pedido(juan), operador, hora2),
    ]);
    expect(resultados.map((r) => r.estado).sort()).toEqual(["registrado", "ya_ingresado"]);
    expect(await db.$count(checkins)).toBe(1);
  });

  it("no registra invitados de otro evento", async () => {
    const otro = await nuevoEventoConInvitados();
    expect(await registrarCheckin(db, otro, pedido(juan), operador)).toEqual({ estado: "no_encontrado" });
    expect(await registrarCheckin(db, eventoId, pedido(99999), operador)).toEqual({ estado: "no_encontrado" });
  });

  it("reimportar el Excel no borra los ingresos", async () => {
    await registrarCheckin(db, eventoId, pedido(juan), operador, hora1);
    const evento = (await obtenerEvento(db, eventoId))!;
    await importarInvitados(db, evento, await crearLibroInvitados(FILAS_EJEMPLO, OPCIONES_POR_DEFECTO), { confirmar: true });
    const [inv] = await db.select().from(invitados).where(eq(invitados.id, juan));
    expect(inv.checkinEn).toEqual(hora1);
    expect(await db.$count(checkins)).toBe(1);
  });

  it("valida el pedido", () => {
    expect(pedidoCheckinSchema.safeParse({ invitadoId: 1, clave: "corta" }).success).toBe(false);
    expect(pedidoCheckinSchema.safeParse({ invitadoId: 1, clave: "a".repeat(32) }).data).toMatchObject({ corregir: false });
  });
});

describe("bloqueo de la carpeta PGlite", () => {
  it("no deja abrir una base que otro proceso vivo tiene abierta", async () => {
    const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), "pglite-lock-"));
    fs.writeFileSync(`${path.resolve(carpeta)}.lock`, String(process.ppid));
    await expect(crearDbPglite(carpeta)).rejects.toThrow(/ya está abierta por otro proceso/);
  });

  it("ignora el bloqueo de un proceso que ya terminó", async () => {
    const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), "pglite-lock-"));
    fs.writeFileSync(`${path.resolve(carpeta)}.lock`, "999999");
    await expect(crearDbPglite(carpeta)).resolves.toBeDefined();
    expect(fs.readFileSync(`${path.resolve(carpeta)}.lock`, "utf8")).toBe(String(process.pid));
  }, 60_000);
});
