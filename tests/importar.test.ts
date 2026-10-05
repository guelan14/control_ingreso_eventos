import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createDb, type Db } from "@/db/create-db";
import { invitados } from "@/db/schema";
import { importarInvitados } from "@/lib/importacion/importar";
import { ArchivoInvalidoError } from "@/lib/importacion/leer-excel";
import { crearLibroInvitados, FILAS_EJEMPLO } from "@/lib/importacion/plantilla";
import { listarInvitados } from "@/lib/invitados/listar";

let db: Db;
beforeEach(() => {
  db = createDb(":memory:");
});

const importar = async (filas = FILAS_EJEMPLO, encabezados?: string[]) =>
  importarInvitados(db, await crearLibroInvitados(filas, encabezados), { confirmar: true });

describe("importarInvitados", () => {
  it("importa la plantilla oficial", async () => {
    const r = await importar();
    expect(r).toMatchObject({ valido: true, importado: true, nuevos: 3, actualizados: 0 });
    expect(listarInvitados(db, {})).toHaveLength(3);
  });

  it("la previsualización no escribe en la base", async () => {
    const libro = await crearLibroInvitados(FILAS_EJEMPLO);
    const r = await importarInvitados(db, libro, { confirmar: false });
    expect(r).toMatchObject({ valido: true, importado: false, nuevos: 3 });
    expect(listarInvitados(db, {})).toHaveLength(0);
  });

  it("es todo o nada: con una fila inválida no importa ninguna", async () => {
    const r = await importar([...FILAS_EJEMPLO, { ...FILAS_EJEMPLO[0], nombre_apellido: "Otro", premiado: "Si" }]);
    expect(r).toMatchObject({ valido: false, importado: false });
    expect(r.errores).toEqual([expect.objectContaining({ fila: 5, campo: "premiado" })]);
    expect(listarInvitados(db, {})).toHaveLength(0);
  });

  it("reimportar actualiza sin duplicar y conserva el check-in", async () => {
    await importar();
    const checkin = new Date("2026-11-20T21:15:00Z");
    db.update(invitados).set({ checkinEn: checkin }).where(eq(invitados.claveUnica, "juan perez|distribuidora posadas")).run();

    const r = await importar([
      { ...FILAS_EJEMPLO[1], nombre_apellido: "JUAN PÉREZ", sector: "C" },
      { ...FILAS_EJEMPLO[0], nombre_apellido: "Nuevo Invitado" },
    ]);
    expect(r).toMatchObject({ nuevos: 1, actualizados: 1 });

    const todos = listarInvitados(db, {});
    expect(todos).toHaveLength(4);
    const juan = todos.find((i) => i.empresa === "Distribuidora Posadas")!;
    expect(juan).toMatchObject({ sector: "C", checkinEn: checkin });
  });

  it("si falta una columna opcional no borra ese dato en invitados existentes", async () => {
    await importar();
    const sinSector = ["nombre_apellido", "rubro", "empresa", "cargo", "confirmacion", "premiado"];
    const r = await importar([{ ...FILAS_EJEMPLO[0], confirmacion: "No Puede" }], sinSector);
    expect(r.columnasOmitidas).toEqual(["sector"]);

    const maria = listarInvitados(db, { q: "maria gonzalez" })[0];
    expect(maria).toMatchObject({ sector: "A", confirmacion: "No Puede" });
  });

  it("rechaza archivos que no son xlsx", async () => {
    const basura = new TextEncoder().encode("no soy un excel").buffer as ArrayBuffer;
    await expect(importarInvitados(db, basura, { confirmar: true })).rejects.toThrow(ArchivoInvalidoError);
  });
});

describe("listarInvitados", () => {
  beforeEach(async () => {
    await importar();
  });

  it("busca sin importar tildes ni mayúsculas, por nombre o empresa", () => {
    expect(listarInvitados(db, { q: "PEREZ" }).map((i) => i.nombreApellido)).toEqual(["Juan Pérez"]);
    expect(listarInvitados(db, { q: "obera" })).toHaveLength(1);
  });

  it("combina filtros", () => {
    expect(listarInvitados(db, { confirmacion: "Confirmado", premiado: true })).toHaveLength(1);
    expect(listarInvitados(db, { confirmacion: "Confirmado", sector: "B", rubro: "Comercio" })).toHaveLength(1);
    expect(listarInvitados(db, { checkin: true })).toHaveLength(0);
    expect(listarInvitados(db, { checkin: false })).toHaveLength(3);
  });
});
