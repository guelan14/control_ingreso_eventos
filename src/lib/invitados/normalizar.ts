/** Quita espacios sobrantes (incluidos los internos repetidos). Devuelve null si queda vacío. */
export function limpiarTexto(valor: unknown): string | null {
  if (valor === null || valor === undefined) return null;
  const texto = String(valor).replace(/\s+/g, " ").trim();
  return texto === "" ? null : texto;
}

/** Minúsculas y sin tildes: "  José  PÉREZ " -> "jose perez" */
export function normalizarComparacion(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Identidad de un invitado: mismo nombre + misma empresa = misma persona. */
export function claveInvitado(nombreApellido: string, empresa: string): string {
  return `${normalizarComparacion(nombreApellido)}|${normalizarComparacion(empresa)}`;
}
