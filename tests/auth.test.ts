import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { crearDbPglite, type Db } from "@/db/create-db";
import { sesiones, usuarios } from "@/db/schema";
import { generarClaveTemporal, hashearClave, verificarClave } from "@/lib/auth/clave";
import { destinoSeguro } from "@/lib/auth/cookie";
import { puede } from "@/lib/auth/roles";
import {
  autenticar,
  BLOQUEO_MS,
  crearSesion,
  DURACION_SESION_MS,
  MAX_INTENTOS,
  cerrarSesion,
  validarSesion,
} from "@/lib/auth/sesiones";
import {
  cambiarClavePropia,
  cambiarEstado,
  cambiarRol,
  ClaveIncorrectaError,
  crearUsuario,
  nuevoUsuarioSchema,
  restablecerClave,
  UltimoAdminError,
  UsuarioDuplicadoError,
  type NuevoUsuario,
} from "@/lib/auth/usuarios";

let db: Db;

beforeAll(async () => {
  db = await crearDbPglite();
}, 60_000);

beforeEach(async () => {
  await db.execute(sql`truncate usuarios, sesiones restart identity cascade`);
});

const nuevo = (datos: Partial<NuevoUsuario> = {}) =>
  crearUsuario(db, { usuario: "jperez", nombre: "Juan Pérez", rol: "recepcion", ...datos });

/** Usuario con contraseña propia ya elegida (no temporal). */
async function usuarioListo(datos: Partial<NuevoUsuario> = {}, clave = "una clave larga") {
  const { usuario, claveTemporal } = await nuevo(datos);
  await cambiarClavePropia(db, usuario.id, { actual: claveTemporal, nueva: clave });
  return usuario;
}

describe("contraseñas", () => {
  it("verifica la correcta y rechaza otra", async () => {
    const hash = await hashearClave("mi clave segura");
    expect(hash).toMatch(/^scrypt\$/);
    expect(hash).not.toContain("mi clave segura");
    expect(await verificarClave("mi clave segura", hash)).toBe(true);
    expect(await verificarClave("mi clave Segura", hash)).toBe(false);
    expect(await verificarClave("x", "hash-roto")).toBe(false);
  });

  it("dos hashes de la misma contraseña son distintos (sal aleatoria)", async () => {
    expect(await hashearClave("igual")).not.toBe(await hashearClave("igual"));
  });

  it("genera contraseñas temporales sin caracteres ambiguos", () => {
    const clave = generarClaveTemporal();
    expect(clave).toHaveLength(12);
    expect(clave).not.toMatch(/[0O1lI]/);
  });
});

describe("usuarios", () => {
  it("normaliza el nombre de usuario a minúsculas y rechaza caracteres raros", () => {
    expect(nuevoUsuarioSchema.parse({ usuario: " JPerez ", nombre: "Juan", rol: "admin" }).usuario).toBe("jperez");
    expect(nuevoUsuarioSchema.safeParse({ usuario: "juan pérez", nombre: "Juan", rol: "admin" }).success).toBe(false);
    expect(nuevoUsuarioSchema.safeParse({ usuario: "juan", nombre: "Juan", rol: "jefe" }).success).toBe(false);
  });

  it("no permite usuarios repetidos y no devuelve el hash", async () => {
    const { usuario } = await nuevo();
    expect(usuario).not.toHaveProperty("claveHash");
    await expect(nuevo({ nombre: "Otro" })).rejects.toThrow(UsuarioDuplicadoError);
  });

  it("un usuario nuevo tiene que cambiar la contraseña temporal", async () => {
    const { usuario, claveTemporal } = await nuevo();
    const login = await autenticar(db, "jperez", claveTemporal);
    expect(login).toEqual({ ok: true, usuarioId: usuario.id, debeCambiarClave: true });

    await cambiarClavePropia(db, usuario.id, { actual: claveTemporal, nueva: "mi clave nueva" });
    expect(await autenticar(db, "jperez", "mi clave nueva")).toMatchObject({ ok: true, debeCambiarClave: false });
    expect(await autenticar(db, "jperez", claveTemporal)).toMatchObject({ ok: false });
  });

  it("cambiar la contraseña exige la actual", async () => {
    const { usuario } = await nuevo();
    await expect(cambiarClavePropia(db, usuario.id, { actual: "otra", nueva: "mi clave nueva" })).rejects.toThrow(
      ClaveIncorrectaError,
    );
  });

  it("siempre queda al menos un administrador activo", async () => {
    const admin = await usuarioListo({ usuario: "admin", rol: "admin" });
    await expect(cambiarRol(db, admin.id, "organizador")).rejects.toThrow(UltimoAdminError);
    await expect(cambiarEstado(db, admin.id, false)).rejects.toThrow(UltimoAdminError);

    await usuarioListo({ usuario: "admin2", rol: "admin" });
    await cambiarRol(db, admin.id, "organizador");
    const [u] = await db.select().from(usuarios).where(eq(usuarios.id, admin.id));
    expect(u.rol).toBe("organizador");
  });
});

describe("login", () => {
  it("rechaza contraseña incorrecta, usuario inexistente y usuario desactivado con el mismo mensaje", async () => {
    const u = await usuarioListo();
    expect(await autenticar(db, "jperez", "incorrecta")).toEqual({ ok: false, motivo: "credenciales" });
    expect(await autenticar(db, "nadie", "una clave larga")).toEqual({ ok: false, motivo: "credenciales" });
    await cambiarEstado(db, u.id, false);
    expect(await autenticar(db, "jperez", "una clave larga")).toEqual({ ok: false, motivo: "credenciales" });
  });

  it("acepta el usuario con mayúsculas o espacios", async () => {
    await usuarioListo();
    expect(await autenticar(db, "  JPEREZ ", "una clave larga")).toMatchObject({ ok: true });
  });

  it(`bloquea ${BLOQUEO_MS / 60000} minutos después de ${MAX_INTENTOS} intentos fallidos`, async () => {
    await usuarioListo();
    const ahora = new Date("2027-04-15T20:00:00Z");
    for (let i = 0; i < MAX_INTENTOS; i++) await autenticar(db, "jperez", "mal", ahora);

    // Bloqueado aunque ahora ponga la contraseña correcta.
    expect(await autenticar(db, "jperez", "una clave larga", ahora)).toEqual({ ok: false, motivo: "bloqueado" });
    const despues = new Date(ahora.getTime() + BLOQUEO_MS + 1000);
    expect(await autenticar(db, "jperez", "una clave larga", despues)).toMatchObject({ ok: true });
  });

  it("un ingreso correcto reinicia el contador de intentos", async () => {
    await usuarioListo();
    for (let i = 0; i < MAX_INTENTOS - 1; i++) await autenticar(db, "jperez", "mal");
    await autenticar(db, "jperez", "una clave larga");
    await autenticar(db, "jperez", "mal");
    expect(await autenticar(db, "jperez", "una clave larga")).toMatchObject({ ok: true });
  });

  it("restablecer la contraseña desbloquea y obliga a cambiarla", async () => {
    const u = await usuarioListo();
    for (let i = 0; i < MAX_INTENTOS; i++) await autenticar(db, "jperez", "mal");
    const temporal = await restablecerClave(db, u.id);
    expect(await autenticar(db, "jperez", temporal)).toMatchObject({ ok: true, debeCambiarClave: true });
  });
});

describe("sesiones", () => {
  it("valida el token y guarda solo su hash", async () => {
    const u = await usuarioListo({ rol: "organizador" });
    const { token } = await crearSesion(db, u.id);
    expect(await validarSesion(db, token)).toEqual({
      usuarioId: u.id,
      usuario: "jperez",
      nombre: "Juan Pérez",
      rol: "organizador",
      debeCambiarClave: false,
    });
    const guardadas = await db.select().from(sesiones);
    expect(guardadas[0].id).not.toBe(token);
    expect(await validarSesion(db, "token-inventado")).toBeNull();
  });

  it("vence a las 12 horas", async () => {
    const u = await usuarioListo();
    const ahora = new Date("2027-04-15T18:00:00Z");
    const { token } = await crearSesion(db, u.id, ahora);
    expect(await validarSesion(db, token, new Date(ahora.getTime() + DURACION_SESION_MS - 1000))).not.toBeNull();
    expect(await validarSesion(db, token, new Date(ahora.getTime() + DURACION_SESION_MS + 1000))).toBeNull();
  });

  it("cerrar sesión invalida el token", async () => {
    const u = await usuarioListo();
    const { token } = await crearSesion(db, u.id);
    await cerrarSesion(db, token);
    expect(await validarSesion(db, token)).toBeNull();
  });

  it("desactivar un usuario o restablecer su contraseña cierra sus sesiones", async () => {
    await usuarioListo({ usuario: "admin", rol: "admin" });
    const u = await usuarioListo();
    const primera = await crearSesion(db, u.id);
    await restablecerClave(db, u.id);
    expect(await validarSesion(db, primera.token)).toBeNull();

    const segunda = await crearSesion(db, u.id);
    await cambiarEstado(db, u.id, false);
    expect(await validarSesion(db, segunda.token)).toBeNull();
  });

  it("cambiar la contraseña propia cierra las otras sesiones pero no la actual", async () => {
    const u = await usuarioListo();
    const celular = await crearSesion(db, u.id);
    const notebook = await crearSesion(db, u.id);
    await cambiarClavePropia(db, u.id, { actual: "una clave larga", nueva: "otra clave larga" }, notebook.token);
    expect(await validarSesion(db, notebook.token)).not.toBeNull();
    expect(await validarSesion(db, celular.token)).toBeNull();
  });
});

describe("permisos", () => {
  it("recepción busca invitados pero no importa ni gestiona", () => {
    expect(puede("recepcion", "invitados:ver")).toBe(true);
    expect(puede("recepcion", "invitados:importar")).toBe(false);
    expect(puede("recepcion", "eventos:gestionar")).toBe(false);
  });

  it("solo el administrador gestiona usuarios", () => {
    expect(puede("admin", "usuarios:gestionar")).toBe(true);
    expect(puede("organizador", "usuarios:gestionar")).toBe(false);
    expect(puede("organizador", "invitados:importar")).toBe(true);
  });
});

describe("destino después del login", () => {
  it("solo acepta rutas internas", () => {
    expect(destinoSeguro("/eventos/3/invitados?q=ana")).toBe("/eventos/3/invitados?q=ana");
    expect(destinoSeguro("https://otro.sitio")).toBe("/");
    expect(destinoSeguro("//otro.sitio")).toBe("/");
    expect(destinoSeguro("/\\otro.sitio")).toBe("/");
    expect(destinoSeguro("/login")).toBe("/");
    expect(destinoSeguro(null)).toBe("/");
  });
});
