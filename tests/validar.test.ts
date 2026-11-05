import { describe, expect, it } from "vitest";
import { RUBROS_SUGERIDOS } from "@/lib/invitados/constants";
import { validarInvitados, type ContextoValidacion, type FilaCruda } from "@/lib/importacion/validar";

const ENCABEZADOS = ["nombre_apellido", "rubro", "empresa", "cargo", "confirmacion", "premiado", "sector"];
const valida = ["Juan Pérez", "Comercio", "ACME", "CEO", "Confirmado", "SI", "A"];

const COMPLETO: ContextoValidacion = { usaRubros: true, usaPremiados: true, rubros: RUBROS_SUGERIDOS };
const CHARLA: ContextoValidacion = { usaRubros: false, usaPremiados: false, rubros: [] };

const filas = (...datos: unknown[][]): FilaCruda[] => datos.map((celdas, i) => ({ fila: i + 2, celdas }));
const validar = (encabezados: unknown[], datos: FilaCruda[], contexto = COMPLETO) =>
  validarInvitados(encabezados, datos, contexto);

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
    expect(r.filasValidas[0].invitado).toMatchObject({ cargo: null, sector: null, dni: null });
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

describe("eventos sin rubros ni premiados", () => {
  it("no exige rubro ni premiado", () => {
    const r = validar(["nombre_apellido", "empresa", "confirmacion"], filas(["Ana", "UNaM", "Confirmado"]), CHARLA);
    expect(r.errores).toEqual([]);
    expect(r.filasValidas[0].invitado).toMatchObject({ rubro: null, premiado: false });
  });

  it("si el Excel trae esas columnas, las ignora con una advertencia", () => {
    const r = validar(ENCABEZADOS, filas(valida), CHARLA);
    expect(r.errores).toEqual([]);
    expect(r.filasValidas[0].invitado).toMatchObject({ rubro: null, premiado: false });
    expect(r.advertencias.map((a) => a.mensaje)).toEqual([
      expect.stringContaining("no usa rubros"),
      expect.stringContaining("no usa premiados"),
    ]);
  });
});

describe("filas", () => {
  it("normaliza espacios y mapea premiado a booleano", () => {
    const r = validar(ENCABEZADOS, filas(["  Juan   Pérez ", "Comercio", "ACME", "", "Confirmado", "NO", ""]));
    expect(r.filasValidas[0].invitado).toMatchObject({
      nombreApellido: "Juan Pérez",
      premiado: false,
      cargo: null,
      claveNombre: "juan perez|acme",
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

  it("tolera mayúsculas/tildes en rubro y guarda el nombre del evento", () => {
    const r = validar(ENCABEZADOS, filas(["Ana", "innovacion", "X", "", "Confirmado", "NO", ""]));
    expect(r.filasValidas[0].invitado.rubro).toBe("Innovación");
  });

  it("valida el rubro contra los rubros de ese evento", () => {
    const evento2027 = { ...COMPLETO, rubros: ["Turismo"] };
    const r = validar(ENCABEZADOS, filas(valida), evento2027);
    expect(r.errores[0]).toMatchObject({ fila: 2, campo: "rubro" });
    expect(r.errores[0].mensaje).toContain("Turismo");
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

describe("DNI", () => {
  const ENC_DNI = [...ENCABEZADOS, "dni"];
  const conDni = (nombre: string, dni: string) => [nombre, "Comercio", "ACME", "", "Confirmado", "NO", "", dni];

  it("normaliza puntos y espacios", () => {
    const r = validar(ENC_DNI, filas(conDni("Ana", "30.123.456")));
    expect(r.filasValidas[0].invitado.dni).toBe("30123456");
  });

  it("acepta homónimos si ambos tienen DNI distinto", () => {
    const r = validar(ENC_DNI, filas(conDni("Juan Pérez", "30111222"), conDni("Juan Pérez", "35999888")));
    expect(r.errores).toEqual([]);
    expect(r.filasValidas).toHaveLength(2);
  });

  it("rechaza homónimos si alguno no tiene DNI", () => {
    const r = validar(ENC_DNI, filas(conDni("Juan Pérez", "30111222"), conDni("Juan Pérez", "")));
    expect(r.errores[0].mensaje).toContain("cargue el DNI");
  });

  it("rechaza DNI repetido o con caracteres inválidos", () => {
    const r = validar(ENC_DNI, filas(conDni("Ana", "30111222"), conDni("Luis", "30.111.222"), conDni("Eva", "30/1")));
    expect(r.errores.map((e) => [e.fila, e.campo])).toEqual([
      [3, "dni"],
      [4, "dni"],
    ]);
  });
});
