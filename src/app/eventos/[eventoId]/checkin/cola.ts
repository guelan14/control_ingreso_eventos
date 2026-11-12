/**
 * Ingresos tocados en este dispositivo que todavía no confirmó el servidor (sin red, servidor caído).
 * Se guardan en localStorage para no perderlos si se recarga la página o se cierra el navegador.
 */
export type DatosAlta = { nombreApellido: string; acompanaA: string; empresa: string; dni: string };

export type Pendiente = {
  clave: string;
  /** 0 en un alta en la puerta: el invitado todavía no existe. */
  invitadoId: number;
  nombre: string;
  corregir: boolean;
  creadoEn: number;
  /** Alta de quien no está en la lista (D6): se crea y se registra su ingreso juntos. */
  alta?: DatosAlta;
};

const VACIA: Pendiente[] = [];

export class ColaPendientes {
  private lista: Pendiente[] | null = null;
  private oyentes = new Set<() => void>();

  constructor(private readonly clave: string) {}

  obtener = (): Pendiente[] => {
    if (this.lista === null) {
      try {
        const leida: unknown = JSON.parse(localStorage.getItem(this.clave) ?? "[]");
        this.lista = Array.isArray(leida) ? (leida as Pendiente[]) : [];
      } catch {
        this.lista = [];
      }
    }
    return this.lista;
  };

  /** En el servidor no hay localStorage: se renderiza vacía. */
  static obtenerEnServidor = () => VACIA;

  suscribir = (oyente: () => void) => {
    this.oyentes.add(oyente);
    return () => {
      this.oyentes.delete(oyente);
    };
  };

  agregar(p: Pendiente) {
    this.guardar([...this.obtener(), p]);
  }

  quitar(clave: string) {
    this.guardar(this.obtener().filter((p) => p.clave !== clave));
  }

  private guardar(lista: Pendiente[]) {
    this.lista = lista;
    try {
      localStorage.setItem(this.clave, JSON.stringify(lista));
    } catch {
      // Modo privado o almacenamiento lleno: queda en memoria mientras la página esté abierta.
    }
    this.oyentes.forEach((o) => o());
  }
}

/** 32 caracteres hexadecimales. crypto.randomUUID no existe en http:// de la red local; esto sí. */
export function nuevaClave() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
