/**
 * Roles según quién usa cada pantalla (respuestas D3, D8 y D11 de Misiones Online):
 *   admin        todo, incluida la gestión de usuarios
 *   organizador  eventos, rubros, carga de la lista, seguimiento y descargas
 *   recepcion    personal de la puerta: busca invitados y registra el ingreso
 */
export const ROLES = ["admin", "organizador", "recepcion"] as const;
export type Rol = (typeof ROLES)[number];

export const NOMBRE_ROL: Record<Rol, string> = {
  admin: "Administrador",
  organizador: "Organizador",
  recepcion: "Recepción",
};

/** Qué roles pueden hacer cada cosa. Es la única fuente de verdad de los permisos. */
export const PERMISOS = {
  "eventos:ver": ["admin", "organizador", "recepcion"],
  "eventos:gestionar": ["admin", "organizador"],
  "invitados:ver": ["admin", "organizador", "recepcion"],
  "invitados:importar": ["admin", "organizador"],
  "checkin:registrar": ["admin", "organizador", "recepcion"],
  /** D3: los organizadores siguen los ingresos con nombres; en la puerta no se ve el panel. */
  "panel:ver": ["admin", "organizador"],
  "usuarios:gestionar": ["admin"],
} as const satisfies Record<string, readonly Rol[]>;

export type Permiso = keyof typeof PERMISOS;

export function puede(rol: Rol, permiso: Permiso): boolean {
  return (PERMISOS[permiso] as readonly Rol[]).includes(rol);
}
