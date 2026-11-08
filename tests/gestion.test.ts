import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { crearDbPglite, type Db } from "@/db/create-db";
import { invitados } from "@/db/schema";
import { crearUsuario } from "@/lib/auth/usuarios";
import { registrarCheckin } from "@/lib/checkin/registrar";
import { crearEvento, obtenerEvento, type EventoConRubros } from "@/lib/eventos/eventos";
import { importarInvitados } from "@/lib/importacion/importar";
import { crearLibroInvitados, FILAS_EJEMPLO, OPCIONES_POR_DEFECTO } from "@/lib/importacion/plantilla";
import { RUBROS_SUGERIDOS } from "@/lib/invitados/constants";
import {
  crearInvitado,
  DatosInvitadoError,
  edicionInvitadoSchema,
  editarInvitado,
  InvitadoDuplicadoError,
  listarSectores,
  nuevoInvitadoSchema,
  obtenerInvitado,
} from "@/lib/invitados/gestion";
import { listarInvitados } from "@/lib/invitados/listar";

let db: Db;
let evento: EventoConRubros;
let charla: EventoConRubros;

beforeAll(async () => {
  db = await crearDbPglite();
}, 60_000);

async function nuevoEvento(config: { usaRubros: boolean; usaPremiados: boolean }) {
  const { id } = await crearEvento(db, {
    nombre: "Evento",
    fecha: "2027-04-15",
    ...config,
    rubros: config.usaRubros ? [...RUBROS_SUGERIDOS] : [],
  });
  return (await obtenerEvento(db, id))!;
}

beforeEach(async () => {
  await db.execute(sql`truncate eventos, rubros, invitados, checkins, usuarios, sesiones restart identity cascade`);
  evento = await nuevoEvento({ usaRubros: true, usaPremiados: true });
  charla = await nuevoEvento({ usaRubros: false, usaPremiados: false });
  await importarInvitados(db, evento, await crearLibroInvitados(FILAS_EJEMPLO, OPCIONES_POR_DEFECTO), { confirmar: true });
});

const rubro = (nombre: string) => evento.rubros.find((r) => r.nombre === nombre)!.id;
const alta = (datos: Record<string, unknown>) => nuevoInvitadoSchema.parse(datos);
const idDe = async (nombre: string) =>
  (await db.select().from(invitados).where(eq(invitados.nombreApellido, nombre)))[0].id;

describe("alta manual", () => {
  it("da de alta con los campos obligatorios y normaliza los textos", async () => {
    const { id } = await crearInvitado(
      db,
      evento,
      alta({ nombreApellido: "  Ana   Ruiz ", empresa: "UNaM", confirmacion: "Confirmado", rubroId: rubro("Educación"), dni: "30.111.222", sector: " " }),
    );
    expect(await obtenerInvitado(db, evento.id, id)).toMatchObject({
      nombreApellido: "Ana Ruiz",
      dni: "30111222",
      sector: null,
      rubro: "Educación",
      premiado: false,
      checkinEn: null,
      historial: [],
    });
  });

  it("valida los campos obligatorios", () => {
    const r = nuevoInvitadoSchema.safeParse({ nombreApellido: " ", empresa: "", confirmacion: "Tal vez" });
    expect(r.success).toBe(false);
    expect(r.error!.issues.map((i) => i.path[0]).sort()).toEqual(["confirmacion", "empresa", "nombreApellido"]);
    expect(nuevoInvitadoSchema.safeParse({ nombreApellido: "Ana Ruiz", empresa: "X SA", confirmacion: "Confirmado", dni: "12" }).success).toBe(false);
  });

  it("exige un rubro del evento si el evento usa rubros", async () => {
    const datos = alta({ nombreApellido: "Ana Ruiz", empresa: "UNaM", confirmacion: "Confirmado" });
    await expect(crearInvitado(db, evento, datos)).rejects.toThrow(DatosInvitadoError);
    const rubroDeOtroEvento = (await nuevoEvento({ usaRubros: true, usaPremiados: true })).rubros[0].id;
    await expect(crearInvitado(db, evento, { ...datos, rubroId: rubroDeOtroEvento })).rejects.toThrow(/no pertenece/);
  });

  it("en una charla no acepta rubro ni premiado", async () => {
    const datos = alta({ nombreApellido: "Ana Ruiz", empresa: "UNaM", confirmacion: "Confirmado" });
    await expect(crearInvitado(db, charla, { ...datos, premiado: true })).rejects.toThrow(/no usa premiados/);
    await expect(crearInvitado(db, charla, { ...datos, rubroId: rubro("Comercio") })).rejects.toThrow(/no usa rubros/);
    expect(await crearInvitado(db, charla, datos)).toHaveProperty("id");
  });

  it("no duplica: mismo nombre y empresa sin DNI, o DNI repetido", async () => {
    const base = { empresa: "Distribuidora Posadas", confirmacion: "Confirmado", rubroId: rubro("Comercio") };
    await expect(crearInvitado(db, evento, alta({ ...base, nombreApellido: "JUAN PEREZ" }))).rejects.toThrow(InvitadoDuplicadoError);
    await expect(
      crearInvitado(db, evento, alta({ ...base, nombreApellido: "Otro Nombre", dni: "28456789" })),
    ).rejects.toThrow(/DNI 28456789: María González/);
  });

  it("acepta homónimos si los dos tienen DNI", async () => {
    const base = { nombreApellido: "Carlos Duarte", empresa: "Banco Regional", confirmacion: "Confirmado", rubroId: rubro("Finanzas") };
    await crearInvitado(db, evento, alta({ ...base, dni: "20111222" }));
    await crearInvitado(db, evento, alta({ ...base, dni: "33444555" }));
    await expect(crearInvitado(db, evento, alta(base))).rejects.toThrow(InvitadoDuplicadoError);
  });

  it("el mismo invitado puede estar en otro evento", async () => {
    const datos = alta({ nombreApellido: "Juan Pérez", empresa: "Distribuidora Posadas", confirmacion: "Confirmado" });
    expect(await crearInvitado(db, charla, datos)).toHaveProperty("id");
  });
});

describe("edición", () => {
  it("cambia confirmación y sector sin perder los otros datos", async () => {
    const id = await idDe("María González");
    await editarInvitado(db, evento, id, edicionInvitadoSchema.parse({ confirmacion: "No Puede", sector: "C" }));
    expect(await obtenerInvitado(db, evento.id, id)).toMatchObject({
      confirmacion: "No Puede",
      sector: "C",
      cargo: "Gerente General",
      dni: "28456789",
      premiado: true,
      rubro: "Agroindustria",
    });
  });

  it("puede marcar o desmarcar premiado, cambiar rubro y vaciar el sector", async () => {
    const id = await idDe("Juan Pérez");
    await editarInvitado(db, evento, id, edicionInvitadoSchema.parse({ premiado: true, rubroId: rubro("Trayectoria"), sector: "" }));
    expect(await obtenerInvitado(db, evento.id, id)).toMatchObject({ premiado: true, rubro: "Trayectoria", sector: null });
  });

  it("no permite editar la hora de ingreso ni otros campos", () => {
    const r = edicionInvitadoSchema.safeParse({ sector: "A", checkinEn: "2027-04-15T22:00:00Z" });
    expect(r.success).toBe(false);
    expect(edicionInvitadoSchema.safeParse({ nombreApellido: "Otro" }).success).toBe(false);
  });

  it("editar no toca el check-in ya registrado", async () => {
    const id = await idDe("Juan Pérez");
    const { usuario } = await crearUsuario(db, { usuario: "puerta1", nombre: "Puerta", rol: "recepcion" });
    const hora = new Date("2027-04-15T22:00:00Z");
    await registrarCheckin(db, evento.id, { invitadoId: id, clave: "clave-gestion-00001", corregir: false }, { usuarioId: usuario.id }, hora);
    await editarInvitado(db, evento, id, edicionInvitadoSchema.parse({ sector: "Z" }));
    const ficha = await obtenerInvitado(db, evento.id, id);
    expect(ficha).toMatchObject({ checkinEn: hora, sector: "Z" });
    expect(ficha!.historial).toEqual([expect.objectContaining({ tipo: "ingreso", operador: "Puerta" })]);
  });

  it("no edita invitados de otro evento ni acepta rubro de un evento sin rubros", async () => {
    const id = await idDe("Juan Pérez");
    expect(await editarInvitado(db, charla, id, { sector: "A" })).toBeNull();
    await expect(editarInvitado(db, charla, id, { rubroId: rubro("Comercio") })).rejects.toThrow(DatosInvitadoError);
    await expect(editarInvitado(db, evento, id, { rubroId: null })).rejects.toThrow(/obligatorio/);
  });
});

describe("filtros combinados", () => {
  it("combina sector + rubro + check-in (criterio de aprobación)", async () => {
    const juan = await idDe("Juan Pérez");
    const { usuario } = await crearUsuario(db, { usuario: "puerta1", nombre: "Puerta", rol: "recepcion" });
    await registrarCheckin(db, evento.id, { invitadoId: juan, clave: "clave-gestion-00002", corregir: false }, { usuarioId: usuario.id });
    const contar = async (f: Parameters<typeof listarInvitados>[2]) => (await listarInvitados(db, evento.id, f)).total;
    expect(await contar({ sector: "B", rubroId: rubro("Comercio"), checkin: true })).toBe(1);
    expect(await contar({ sector: "B", rubroId: rubro("Comercio"), checkin: false })).toBe(0);
    expect(await contar({ sector: "A", rubroId: rubro("Comercio") })).toBe(0);
  });

  it("lista los sectores usados en el evento", async () => {
    expect(await listarSectores(db, evento.id)).toEqual(["A", "B"]);
    expect(await listarSectores(db, charla.id)).toEqual([]);
  });
});
