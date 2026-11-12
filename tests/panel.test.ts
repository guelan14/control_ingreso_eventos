import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { crearDbPglite, type Db } from "@/db/create-db";
import { invitados } from "@/db/schema";
import { crearUsuario } from "@/lib/auth/usuarios";
import { registrarCheckin } from "@/lib/checkin/registrar";
import { crearEvento, obtenerEvento, type EventoConRubros } from "@/lib/eventos/eventos";
import { importarInvitados } from "@/lib/importacion/importar";
import { crearLibroInvitados, FILAS_EJEMPLO, OPCIONES_POR_DEFECTO, type FilaPlantilla } from "@/lib/importacion/plantilla";
import { RUBROS_SUGERIDOS } from "@/lib/invitados/constants";
import { CANTIDAD_ULTIMOS, obtenerPanel } from "@/lib/panel/panel";
import { porcentaje } from "@/lib/panel/tipos";

let db: Db;
let evento: EventoConRubros;
let operador: { usuarioId: number };
let ids: Record<string, number>;

beforeAll(async () => {
  db = await crearDbPglite();
}, 60_000);

// Las 3 filas de la plantilla + un premiado que avisó que no viene + otro premiado confirmado.
const FILAS: FilaPlantilla[] = [
  ...FILAS_EJEMPLO,
  { ...FILAS_EJEMPLO[0], nombre_apellido: "Pedro Krause", dni: null, confirmacion: "No Puede", rubro: "Comercio" },
  { ...FILAS_EJEMPLO[0], nombre_apellido: "Sofía Benítez", dni: null, rubro: "Comercio", sector: "C" },
];

async function eventoConInvitados(config = { usaRubros: true, usaPremiados: true }) {
  const { id } = await crearEvento(db, {
    nombre: "Aniversario 2027",
    fecha: "2027-04-15",
    ...config,
    rubros: config.usaRubros ? [...RUBROS_SUGERIDOS] : [],
  });
  const e = (await obtenerEvento(db, id))!;
  const encabezados = config.usaRubros ? undefined : ["nombre_apellido", "empresa", "confirmacion", "premiado"];
  await importarInvitados(db, e, await crearLibroInvitados(FILAS, { ...OPCIONES_POR_DEFECTO, encabezados }), { confirmar: true });
  return e;
}

let n = 0;
const ingresar = (nombre: string, hora: string, corregir = false) =>
  registrarCheckin(
    db,
    evento.id,
    { invitadoId: ids[nombre], clave: `clave-panel-${++n}`.padEnd(20, "x"), corregir },
    operador,
    new Date(`2027-04-15T${hora}:00Z`),
  );

beforeEach(async () => {
  await db.execute(sql`truncate eventos, rubros, invitados, checkins, usuarios, sesiones restart identity cascade`);
  evento = await eventoConInvitados();
  operador = { usuarioId: (await crearUsuario(db, { usuario: "puerta1", nombre: "Puerta", rol: "recepcion" })).usuario.id };
  ids = Object.fromEntries((await db.select().from(invitados)).map((i) => [i.nombreApellido, i.id]));
});

describe("obtenerPanel", () => {
  it("sin ingresos: todos los premiados confirmados pendientes", async () => {
    const p = await obtenerPanel(db, evento);
    expect(p.totales).toEqual({ invitados: 5, confirmados: 3, ingresados: 0, faltan: 3, sinLista: 0 });
    expect(p.premiados.total).toBe(3);
    expect(p.premiados.pendientes.map((x) => x.nombreApellido)).toEqual(["María González", "Sofía Benítez"]);
    expect(p.premiados.avisaronQueNoVienen.map((x) => x.nombreApellido)).toEqual(["Pedro Krause"]);
    expect(p.ultimos).toEqual([]);
  });

  it("cuenta los ingresos y saca de pendientes a los premiados que llegaron", async () => {
    await ingresar("María González", "22:00");
    await ingresar("Juan Pérez", "22:05");
    const p = await obtenerPanel(db, evento);
    expect(p.totales).toMatchObject({ ingresados: 2, faltan: 1 });
    expect(p.premiados).toMatchObject({ ingresados: 1 });
    expect(p.premiados.pendientes.map((x) => x.nombreApellido)).toEqual(["Sofía Benítez"]);
    expect(p.premiados.pendientes[0]).toMatchObject({ rubro: "Comercio", sector: "C" });
  });

  it("un premiado que avisó que no venía y llega igual suma como ingresado y sale de su sección", async () => {
    await ingresar("Pedro Krause", "22:10");
    const p = await obtenerPanel(db, evento);
    expect(p.totales).toMatchObject({ ingresados: 1, faltan: 3 });
    expect(p.premiados.avisaronQueNoVienen).toEqual([]);
  });

  it("todos los premiados confirmados adentro: pendientes vacío", async () => {
    await ingresar("María González", "22:00");
    await ingresar("Sofía Benítez", "22:01");
    expect((await obtenerPanel(db, evento)).premiados.pendientes).toEqual([]);
  });

  it("desglosa por rubro con los datos importados", async () => {
    await ingresar("Sofía Benítez", "22:00");
    const { rubros } = await obtenerPanel(db, evento);
    expect(rubros).toHaveLength(RUBROS_SUGERIDOS.length);
    expect(rubros.find((r) => r.nombre === "Comercio")).toMatchObject({ invitados: 3, confirmados: 2, ingresados: 1 });
    expect(rubros.find((r) => r.nombre === "Educación")).toMatchObject({ invitados: 1, confirmados: 0, ingresados: 0 });
    expect(rubros.find((r) => r.nombre === "Finanzas")).toMatchObject({ invitados: 0, confirmados: 0, ingresados: 0 });
  });

  it(`muestra los últimos ${CANTIDAD_ULTIMOS} ingresos, el más reciente primero, con las correcciones`, async () => {
    await ingresar("Juan Pérez", "22:00");
    await ingresar("María González", "22:30");
    await ingresar("Juan Pérez", "22:45", true);
    const { ultimos } = await obtenerPanel(db, evento);
    expect(ultimos.map((u) => [u.nombreApellido, u.tipo])).toEqual([
      ["Juan Pérez", "correccion"],
      ["María González", "ingreso"],
      ["Juan Pérez", "ingreso"],
    ]);
    expect(ultimos[1]).toMatchObject({ premiado: true, registradoEn: "2027-04-15T22:30:00.000Z" });
  });

  it(`no muestra más de ${CANTIDAD_ULTIMOS}`, async () => {
    const muchos = Array.from({ length: 20 }, (_, i) => ({ ...FILAS_EJEMPLO[1], nombre_apellido: `Persona ${i}` }));
    await importarInvitados(db, evento, await crearLibroInvitados(muchos, OPCIONES_POR_DEFECTO), { confirmar: true });
    ids = Object.fromEntries((await db.select().from(invitados)).map((i) => [i.nombreApellido, i.id]));
    for (let i = 0; i < 20; i++) await ingresar(`Persona ${i}`, `21:${String(i).padStart(2, "0")}`);
    const { ultimos } = await obtenerPanel(db, evento);
    expect(ultimos).toHaveLength(CANTIDAD_ULTIMOS);
    expect(ultimos[0].nombreApellido).toBe("Persona 19");
  });

  it("cada evento tiene su panel", async () => {
    await ingresar("Juan Pérez", "22:00");
    const otro = await eventoConInvitados();
    expect((await obtenerPanel(db, otro)).totales.ingresados).toBe(0);
  });

  it("un evento sin rubros ni premiados no los calcula", async () => {
    const charla = await eventoConInvitados({ usaRubros: false, usaPremiados: false });
    const p = await obtenerPanel(db, charla);
    expect(p.rubros).toEqual([]);
    expect(p.premiados.pendientes).toEqual([]);
    expect(p.totales.invitados).toBe(5);
  });
});

describe("porcentaje", () => {
  it("redondea y no divide por cero", () => {
    expect(porcentaje(1, 3)).toBe(33);
    expect(porcentaje(2, 3)).toBe(67);
    expect(porcentaje(0, 0)).toBe(0);
  });
});
