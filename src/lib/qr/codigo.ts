/** Formato del código de invitado: 16 caracteres hexadecimales en mayúsculas (lo genera la base). */
const FORMATO = /^[0-9A-F]{16}$/;

/**
 * Código a partir de lo que leyó el escáner o se tipeó. Acepta minúsculas, espacios y, por si en el
 * futuro el QR lleva una dirección, también el último tramo de una URL.
 */
export function extraerCodigo(leido: string): string | null {
  const ultimo = leido.trim().split(/[/?#=]/).filter(Boolean).at(-1) ?? "";
  const codigo = ultimo.replace(/\s+/g, "").toUpperCase();
  return FORMATO.test(codigo) ? codigo : null;
}
