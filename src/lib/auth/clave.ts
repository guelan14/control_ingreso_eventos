import { randomBytes, randomInt, scrypt, timingSafeEqual } from "node:crypto";
import { z } from "@/lib/zod";

/**
 * Hash de contraseñas con scrypt (incluido en Node, sin dependencias nativas).
 * Formato guardado: scrypt$N$r$p$sal$hash, así los parámetros pueden subir sin romper hashes viejos.
 */
const PARAMETROS = { N: 2 ** 15, r: 8, p: 1 };
const LARGO_HASH = 64;

export const nuevaClaveSchema = z
  .string()
  .min(10, "La contraseña debe tener al menos 10 caracteres.")
  .max(128, "La contraseña puede tener hasta 128 caracteres.");

function derivar(clave: string, sal: Buffer, { N, r, p }: typeof PARAMETROS): Promise<Buffer> {
  return new Promise((resolver, rechazar) =>
    scrypt(clave.normalize("NFKC"), sal, LARGO_HASH, { N, r, p, maxmem: 256 * N * r }, (error, clave) =>
      error ? rechazar(error) : resolver(clave),
    ),
  );
}

export async function hashearClave(clave: string): Promise<string> {
  const sal = randomBytes(16);
  const hash = await derivar(clave, sal, PARAMETROS);
  const { N, r, p } = PARAMETROS;
  return ["scrypt", N, r, p, sal.toString("base64"), hash.toString("base64")].join("$");
}

export async function verificarClave(clave: string, guardado: string): Promise<boolean> {
  const [algoritmo, N, r, p, sal, hash] = guardado.split("$");
  if (algoritmo !== "scrypt" || !sal || !hash) return false;
  const esperado = Buffer.from(hash, "base64");
  const calculado = await derivar(clave, Buffer.from(sal, "base64"), { N: Number(N), r: Number(r), p: Number(p) });
  return calculado.length === esperado.length && timingSafeEqual(calculado, esperado);
}

// Sin letras que se confunden al dictarlas o leerlas (0/O, 1/l/I).
const ALFABETO = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Contraseña temporal para un usuario nuevo o un restablecimiento; se cambia en el primer ingreso. */
export function generarClaveTemporal(largo = 12): string {
  return Array.from({ length: largo }, () => ALFABETO[randomInt(ALFABETO.length)]).join("");
}
