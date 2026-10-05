import { describe, expect, it } from "vitest";
import { RUBROS_BASE } from "@/lib/invitados/constants";
import { validarInvitados, type FilaCruda } from "@/lib/importacion/validar";

const ENCABEZADOS = ["nombre_apellido", "rubro", "empresa", "cargo", "confirmacion", "premiado", "sector"];
const valida = ["Juan Pérez", "Comercio", "ACME", "CEO", "Confirmado", "SI", "A"];

const filas = (...datos: unknown[][]): FilaCruda[] => datos.map((celdas, i) => ({ fila: i + 2, celdas }));
const validar = (encabezados: unknown[], datos: FilaCruda[]) =>
  validarInvitados(encabezados, datos, RUBROS_BASE);

describe("encabezados", () => {
  it("acepta el formato oficial", () => {
    const r = validar(ENCABEZADOS, filas(valida));
    expect(r.errores).toEqual([]);
    expect(r.filasValidas).toHaveLength(1);
  });

  it("acepta 'confirmación' con tilde (el documento usa ambas formas)", () => {
    const enc = ENCABEZADOS.map((h) => (h === "confirmacion" ? "confirmación" : h));
    expect(validar(enc, filas(valida)).errores).toEqual([]);
  });

  it("reporta columnas obligatorias faltantes y no valida filas", () => {
    const r = validar(["nombre_apellido", "empresa"], filas(["Juan", "ACME"]));
    const faltantes = r.errores.map((e) => e.campo);
    expect(faltantes).toEqual(expect.arrayContaining(["rubro", "confirmacion", "premiado"]));
    expect(r.filasValidas).toEqual([]);
  });

  it("permite omitir columnas opcionales", () => {
    const enc = ["nombre_apellido", "rubro", "empresa", "confirmacion", "premiado"];
    const r = validar(enc, filas(["Ana", "Finanzas", "Banco", "Confirmado", "NO"]));
    expect(r.errores).toEqual([]);
    expect(r.filasValidas[0].invitado).toMatchObject({ cargo: null, sector: null });
  });

  it("rechaza encabezados con espacios o mayúsculas y lo explica", () => {
    const enc = ENCABEZADOS.map((h) => (h === "empresa" ? " Empresa " : h));
    const r = validar(enc, filas(valida));
    expect(r.errores).toHaveLength(1);
    expect(r.errores[0].mensaje).toContain('exactamente "empresa"');
  });

  it("ignora columnas desconocidas con una advertencia", () => {
    const r = validar([...ENCABEZADOS, "telefono"], filas([...valida, "123"]));
    expect(r.errores).toEqual([]);
    expect(r.advertencias[0].campo).toBe("telefono");
  });
});

describe("filas", () => {
  it("normaliza espacios y mapea premiado a booleano", () => {
    const r = validar(ENCABEZADOS, filas(["  Juan   Pérez ", "Comercio", "ACME", "", "Confirmado", "NO", ""]));
    expect(r.filasValidas[0].invitado).toMatchObject({
      nombreApellido: "Juan Pérez",
      premiado: false,
      cargo: null,
      claveUnica: "juan perez|acme",
    });
  });

  it("reporta cada error con su número de fila y campo", () => {
    const r = validar(
      ENCABEZADOS,
      filas(
        valida,
        ["Ana", "Comercio", "ACME", "", "Confirmado", "si", ""],
        ["Luis", "Comercio", "ACME", "", "Tal vez", "NO", ""],
        ["", "Comercio", "ACME", "", "Confirmado", "NO", ""],
      ),
    );
    expect(r.errores.map((e) => [e.fila, e.campo])).toEqual([
      [3, "premiado"],
      [4, "confirmacion"],
      [5, "nombre_apellido"],
    ]);
    expect(r.filasValidas).toHaveLength(1);
  });

  it("tolera mayúsculas/tildes en rubro y guarda el nombre oficial", () => {
    const r = validar(ENCABEZADOS, filas(["Ana", "innovacion", "X", "", "Confirmado", "NO", ""]));
    expect(r.filasValidas[0].invitado.rubro).toBe("Innovación");
  });

  it("rechaza rubros inexistentes", () => {
    const r = validar(ENCABEZADOS, filas(["Ana", "Pesca", "X", "", "Confirmado", "NO", ""]));
    expect(r.errores[0]).toMatchObject({ fila: 2, campo: "rubro" });
  });

  it("detecta invitados duplicados dentro del mismo archivo (nombre + empresa)", () => {
    const r = validar(ENCABEZADOS, filas(valida, ["JUAN PEREZ", "Comercio", "acme", "", "Confirmado", "NO", ""]));
    expect(r.errores[0]).toMatchObject({ fila: 3 });
    expect(r.errores[0].mensaje).toContain("fila 2");
  });

  it("ignora filas vacías y avisa si no hay ningún invitado", () => {
    const r = validar(ENCABEZADOS, filas(["", null, undefined]));
    expect(r.totalFilas).toBe(0);
    expect(r.errores[0].mensaje).toContain("no tiene invitados");
  });
});
