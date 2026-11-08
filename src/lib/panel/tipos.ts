/** Tipos y utilidades del panel, sin dependencias del servidor: los usa también la pantalla. */

export const SEGUNDOS_ACTUALIZACION = 15;

/** Premiado que todavía no ingresó. */
export type PremiadoPendiente = {
  id: number;
  nombreApellido: string;
  empresa: string;
  cargo: string | null;
  rubro: string | null;
  sector: string | null;
};

export type Panel = {
  /** ISO. La hora de los datos, para mostrar "actualizado a las…". */
  generadoEn: string;
  totales: {
    invitados: number;
    confirmados: number;
    ingresados: number;
    /** Confirmados que todavía no llegaron. */
    faltan: number;
  };
  premiados: {
    total: number;
    ingresados: number;
    /** Confirmados que no llegaron: la tabla crítica. */
    pendientes: PremiadoPendiente[];
    /** Marcaron "No Puede" y no llegaron: sección aparte (D5). */
    avisaronQueNoVienen: PremiadoPendiente[];
  };
  rubros: { id: number; nombre: string; invitados: number; confirmados: number; ingresados: number }[];
  ultimos: {
    id: number;
    nombreApellido: string;
    empresa: string;
    premiado: boolean;
    tipo: "ingreso" | "correccion";
    /** ISO */
    registradoEn: string;
  }[];
};

/** Porcentaje entero, sin dividir por cero. */
export function porcentaje(parte: number, total: number): number {
  return total === 0 ? 0 : Math.round((parte / total) * 100);
}
