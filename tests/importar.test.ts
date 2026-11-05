import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { crearDbPglite, type Db } from "@/db/create-db";
import { invitados } from "@/db/schema";
import { crearEvento, obtenerEvento, type EventoConRubros } from "@/lib/eventos/eventos";
import { importarInvitados } from "@/lib/importacion/importar";
import { ArchivoInvalidoError, LIMITES, tamanioDescomprimido } from "@/lib/importacion/leer-excel";
import {
  crearLibroInvitados,
  FILAS_EJEMPLO,
  OPCIONES_POR_DEFECTO,
  type FilaPlantilla,
} from "@/lib/importacion/plantilla";
import { RUBROS_SUGERIDOS } from "@/lib/invitados/constants";
import { listarInvitados } from "@/lib/invitados/listar";

let db: Db;
let evento: EventoConRubros;

// Un Postgres en memoria (PGlite) por archivo; entre tests se vacían las tablas.
beforeAll(async () => {
  db = await crearDbPglite();
}, 60_000);

async function nuevoEvento(config = { usaRubros: true, usaPremiados: true }) {
  const creado = await crearEvento(db, {
    nombre: "Aniversario 2027",
    fecha: "2027-04-15",
    ...config,
    rubros: config.usaRubros ? [...RUBROS_SUGERIDOS] : [],
  });
  return (await obtenerEvento(db, creado.id))!;
}

beforeEach(async () => {
  await db.execute(sql`truncate eventos, rubros, invitados restart identity cascade`);
  evento = await nuevoEvento();
});

const libro = (filas: FilaPlantilla[] = FILAS_EJEMPLO, encabezados?: string[]) =>
  crearLibroInvitados(filas, { ...OPCIONES_POR_DEFECTO, encabezados });

const importar = async (filas?: FilaPlantilla[], encabezados?: string[], destino = evento) =>
  importarInvitados(db, destino, await libro(filas, encabezados), { confirmar: true });

const todos = async (destino = evento) => (await listarInvitados(db, destino.id, { porPagina: 200 })).data;

describe("importarInvitados", () => {
  it("importa la plantilla oficial", async () => {
    const r = await importar();
    expect(r).toMatchObject({ valido: true, importado: true, nuevos: 3, actualizados: 0 });
    const lista = await todos();
    expect(lista).toHaveLength(3);
    expect(lista.find((i) => i.dni)).toMatchObject({ nombreApellido: "María González", dni: "28456789", rubro: "Agroindustria" });
  });

  it("la previsualización no escribe en la base", async () => {
    const r = await importarInvitados(db, evento, await libro(), { confirmar: false });
    expect(r).toMatchObject({ valido: true, importado: false, nuevos: 3 });
    expect(await todos()).toHaveLength(0);
  });

  it("es todo o nada: con una fila inválida no importa ninguna", async () => {
    const r = await importar([...FILAS_EJEMPLO, { ...FILAS_EJEMPLO[0], nombre_apellido: "Otro", dni: null, premiado: "Si" }]);
    expect(r).toMatchObject({ valido: false, importado: false });
    expect(r.errores).toEqual([expect.objectContaining({ fila: 5, campo: "premiado" })]);
    expect(await todos()).toHaveLength(0);
  });

  it("reimportar actualiza sin duplicar y conserva el check-in", async () => {
    await importar();
    const checkin = new Date("2027-04-15T21:15:00Z");
    await db.update(invitados).set({ checkinEn: checkin }).where(eq(invitados.claveNombre, "juan perez|distribuidora posadas"));

    const r = await importar([
      { ...FILAS_EJEMPLO[1], nombre_apellido: "JUAN PÉREZ", sector: "C" },
      { ...FILAS_EJEMPLO[0], nombre_apellido: "Nuevo Invitado", dni: null },
    ]);
    expect(r).toMatchObject({ nuevos: 1, actualizados: 1 });

    const lista = await todos();
    expect(lista).toHaveLength(4);
    expect(lista.find((i) => i.empresa === "Distribuidora Posadas")).toMatchObject({ sector: "C", checkinEn: checkin });
  });

  it("una celda opcional vacía no borra el dato existente (A1)", async () => {
    await importar();
    await importar([{ ...FILAS_EJEMPLO[0], cargo: "", sector: null, confirmacion: "No Puede" }]);
    const [maria] = (await listarInvitados(db, evento.id, { q: "maria gonzalez" })).data;
    expect(maria).toMatchObject({ cargo: "Gerente General", sector: "A", confirmacion: "No Puede" });
  });

  it("si falta una columna opcional tampoco borra ese dato", async () => {
    await importar();
    const sinSector = ["nombre_apellido", "rubro", "empresa", "cargo", "confirmacion", "premiado"];
    const r = await importar([{ ...FILAS_EJEMPLO[0] }], sinSector);
    expect(r.columnasOmitidas).toEqual(["dni", "sector"]);
    const [maria] = (await listarInvitados(db, evento.id, { q: "maria" })).data;
    expect(maria).toMatchObject({ sector: "A", dni: "28456789" });
  });

  it("si un invitado sin DNI se reimporta con DNI, se actualiza el mismo (no se duplica)", async () => {
    await importar();
    const r = await importar([{ ...FILAS_EJEMPLO[1], dni: "33.444.555" }]);
    expect(r).toMatchObject({ nuevos: 0, actualizados: 1 });
    expect((await todos()).find((i) => i.nombreApellido === "Juan Pérez")?.dni).toBe("33444555");
  });

  it("con homónimos cargados, una fila sin DNI no se puede asignar y se reporta", async () => {
    await importar([
      { ...FILAS_EJEMPLO[1], dni: "30111222" },
      { ...FILAS_EJEMPLO[1], dni: "35999888" },
    ]);
    const r = await importar([{ ...FILAS_EJEMPLO[1], dni: null }]);
    expect(r.valido).toBe(false);
    expect(r.errores[0]).toMatchObject({ campo: "dni" });
    expect(r.errores[0].mensaje).toContain("Hay 2 invitados");
  });

  it("los eventos son independientes: el mismo invitado puede estar en dos ediciones", async () => {
    await importar();
    const otro = await nuevoEvento();
    const r = await importar(undefined, undefined, otro);
    expect(r).toMatchObject({ nuevos: 3, actualizados: 0 });
    expect(await todos(evento)).toHaveLength(3);
    expect(await todos(otro)).toHaveLength(3);
  });

  it("importa un evento sin rubros ni premiados", async () => {
    const charla = await nuevoEvento({ usaRubros: false, usaPremiados: false });
    const r = await importar(
      [{ nombre_apellido: "Ana Ruiz", empresa: "UNaM", confirmacion: "Confirmado" }],
      ["nombre_apellido", "empresa", "confirmacion"],
      charla,
    );
    expect(r).toMatchObject({ valido: true, nuevos: 1 });
    expect((await todos(charla))[0]).toMatchObject({ rubro: null, premiado: false });
  });
});

describe("archivos no confiables (A4)", () => {
  it("rechaza archivos que no son xlsx aunque tengan la extensión", async () => {
    const basura = new TextEncoder().encode("no soy un excel").buffer as ArrayBuffer;
    await expect(importarInvitados(db, evento, basura, { confirmar: true })).rejects.toThrow(ArchivoInvalidoError);
  });

  it("calcula el tamaño descomprimido sin descomprimir", async () => {
    const tamanio = tamanioDescomprimido(await libro());
    expect(tamanio).toBeGreaterThan(0);
    expect(tamanio).toBeLessThan(LIMITES.descomprimidoMb * 1024 * 1024);
  });

  it(`rechaza más de ${LIMITES.filas} filas`, async () => {
    const muchas = Array.from({ length: LIMITES.filas + 1 }, (_, i) => ({ ...FILAS_EJEMPLO[1], nombre_apellido: `P ${i}` }));
    await expect(importar(muchas)).rejects.toThrow(/máximo es 5000/);
  }, 30_000);
});

describe("listarInvitados", () => {
  beforeEach(async () => {
    await importar();
  });

  it("busca por palabras en cualquier orden, sin tildes ni mayúsculas (M1)", async () => {
    const buscar = async (q: string) => (await listarInvitados(db, evento.id, { q })).data.map((i) => i.nombreApellido);
    expect(await buscar("PEREZ juan")).toEqual(["Juan Pérez"]);
    expect(await buscar("gonzalez obera")).toEqual(["María González"]);
    expect(await buscar("perez obera")).toEqual([]);
  });

  it("busca por DNI", async () => {
    expect((await listarInvitados(db, evento.id, { q: "28.456" })).data).toHaveLength(1);
  });

  it("combina filtros", async () => {
    const comercio = evento.rubros.find((r) => r.nombre === "Comercio")!.id;
    const contar = async (f: Parameters<typeof listarInvitados>[2]) => (await listarInvitados(db, evento.id, f)).total;
    expect(await contar({ confirmacion: "Confirmado", premiado: true })).toBe(1);
    expect(await contar({ confirmacion: "Confirmado", sector: "B", rubroId: comercio })).toBe(1);
    expect(await contar({ checkin: true })).toBe(0);
    expect(await contar({ checkin: false })).toBe(3);
  });

  it("pagina los resultados", async () => {
    const r = await listarInvitados(db, evento.id, { porPagina: 2, pagina: 2 });
    expect(r).toMatchObject({ total: 3, pagina: 2, porPagina: 2 });
    expect(r.data).toHaveLength(1);
  });
});
