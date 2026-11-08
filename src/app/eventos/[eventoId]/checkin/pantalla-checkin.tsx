"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { formatearHora } from "@/lib/fechas";
import { ColaPendientes, nuevaClave, type Pendiente } from "./cola";

type Invitado = {
  id: number;
  nombreApellido: string;
  empresa: string;
  cargo: string | null;
  sector: string | null;
  rubro: string | null;
  premiado: boolean;
  confirmacion: "Confirmado" | "No Puede";
  checkinEn: string | null;
};

type Envio =
  | { tipo: "registrado"; invitado: Invitado }
  | { tipo: "ya_ingresado"; invitado: Invitado }
  /** El servidor lo rechazó por un motivo que no se arregla reintentando. */
  | { tipo: "rechazado"; mensaje: string }
  /** Sin red, servidor caído o sesión vencida: queda en la cola y se reintenta. */
  | { tipo: "reintentar"; sesionVencida: boolean };

type Vista =
  | { tipo: "busqueda" }
  | { tipo: "tarjeta"; invitado: Invitado; confirmandoCorreccion: boolean }
  | { tipo: "exito"; invitado: Invitado; hora: string; pendiente: boolean };

const ESPERA_REINTENTO_MS = 5000;
const VUELTA_AUTOMATICA_MS = 2500;

async function enviar(eventoId: number, p: Pendiente): Promise<Envio> {
  try {
    const r = await fetch(`/api/eventos/${eventoId}/checkin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invitadoId: p.invitadoId, clave: p.clave, corregir: p.corregir }),
      signal: AbortSignal.timeout(8000),
    });
    const cuerpo = await r.json().catch(() => null);
    if (r.ok) return { tipo: "registrado", invitado: cuerpo.invitado };
    if (r.status === 409) return { tipo: "ya_ingresado", invitado: cuerpo.invitado };
    if (r.status === 401) return { tipo: "reintentar", sesionVencida: true };
    if (r.status >= 500 || r.status === 408 || r.status === 429) return { tipo: "reintentar", sesionVencida: false };
    return { tipo: "rechazado", mensaje: cuerpo?.error?.mensaje ?? `Error ${r.status}` };
  } catch {
    return { tipo: "reintentar", sesionVencida: false };
  }
}

export function PantallaCheckin({ eventoId, nombreEvento }: { eventoId: number; nombreEvento: string }) {
  const [cola] = useState(() => new ColaPendientes(`checkin-pendientes-${eventoId}`));
  const pendientes = useSyncExternalStore(cola.suscribir, cola.obtener, ColaPendientes.obtenerEnServidor);

  const [q, setQ] = useState("");
  const [resultados, setResultados] = useState<Invitado[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [vista, setVista] = useState<Vista>({ tipo: "busqueda" });
  const [enviando, setEnviando] = useState(false);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [sesionVencida, setSesionVencida] = useState(false);
  const buscador = useRef<HTMLInputElement>(null);
  const vaciando = useRef(false);

  const avisar = (mensaje: string) => setAvisos((a) => [...a, mensaje]);

  // Búsqueda mientras se escribe, sin Enter. Se cancela la anterior si llega una tecla nueva.
  useEffect(() => {
    const texto = q.trim();
    if (texto.length < 2) return;
    const control = new AbortController();
    const temporizador = setTimeout(async () => {
      setBuscando(true);
      try {
        const r = await fetch(
          `/api/eventos/${eventoId}/invitados?${new URLSearchParams({ q: texto, porPagina: "8" })}`,
          { signal: control.signal },
        );
        if (r.status === 401) return setSesionVencida(true);
        if (r.ok) setResultados((await r.json()).data);
      } catch {
        // Cancelada por otra tecla o sin red: se mantiene la lista anterior.
      } finally {
        if (!control.signal.aborted) setBuscando(false);
      }
    }, 150);
    return () => {
      control.abort();
      clearTimeout(temporizador);
    };
  }, [q, eventoId]);

  const volver = useCallback(() => {
    setVista({ tipo: "busqueda" });
    setQ("");
    setResultados([]);
    // Después del render, para que el input ya esté en pantalla.
    setTimeout(() => buscador.current?.focus(), 0);
  }, []);

  // Reintentos automáticos de lo que quedó pendiente.
  const vaciarCola = useCallback(async () => {
    if (vaciando.current) return;
    vaciando.current = true;
    try {
      for (const p of cola.obtener()) {
        const r = await enviar(eventoId, p);
        if (r.tipo === "reintentar") {
          setSesionVencida(r.sesionVencida);
          break;
        }
        cola.quitar(p.clave);
        setSesionVencida(false);
        if (r.tipo === "ya_ingresado") {
          avisar(`${p.nombre} ya había ingresado a las ${formatearHora(r.invitado.checkinEn!)}. No se cambió la hora.`);
        } else if (r.tipo === "rechazado") {
          avisar(`No se pudo registrar a ${p.nombre}: ${r.mensaje}`);
        }
      }
    } finally {
      vaciando.current = false;
    }
  }, [cola, eventoId]);

  useEffect(() => {
    if (pendientes.length === 0) return;
    const intervalo = setInterval(vaciarCola, ESPERA_REINTENTO_MS);
    window.addEventListener("online", vaciarCola);
    return () => {
      clearInterval(intervalo);
      window.removeEventListener("online", vaciarCola);
    };
  }, [pendientes.length, vaciarCola]);

  // Un ingreso común vuelve solo a la búsqueda. Un premiado no: hay que confirmar que se vio.
  useEffect(() => {
    if (vista.tipo !== "exito" || vista.invitado.premiado) return;
    const t = setTimeout(volver, VUELTA_AUTOMATICA_MS);
    return () => clearTimeout(t);
  }, [vista, volver]);

  const registrar = async (invitado: Invitado, corregir: boolean) => {
    if (enviando) return;
    const pendiente: Pendiente = {
      clave: nuevaClave(),
      invitadoId: invitado.id,
      nombre: invitado.nombreApellido,
      corregir,
      creadoEn: Date.now(),
    };
    // Primero a la cola: si la página se cierra a mitad del envío, no se pierde.
    cola.agregar(pendiente);
    setEnviando(true);
    const r = await enviar(eventoId, pendiente);
    setEnviando(false);

    if (r.tipo === "reintentar") {
      setSesionVencida(r.sesionVencida);
      if (invitado.premiado) navigator.vibrate?.([400, 150, 400, 150, 800]);
      setVista({ tipo: "exito", invitado, hora: formatearHora(new Date()), pendiente: true });
      return;
    }
    cola.quitar(pendiente.clave);
    setSesionVencida(false);
    if (r.tipo === "registrado") {
      if (r.invitado.premiado) navigator.vibrate?.([400, 150, 400, 150, 800]);
      setVista({ tipo: "exito", invitado: r.invitado, hora: formatearHora(r.invitado.checkinEn!), pendiente: false });
    } else if (r.tipo === "ya_ingresado") {
      setVista({ tipo: "tarjeta", invitado: r.invitado, confirmandoCorreccion: false });
    } else {
      avisar(r.mensaje);
    }
  };

  const textoBuscado = q.trim().length >= 2;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-bold">Check-in · {nombreEvento}</h1>
        {pendientes.length > 0 && (
          <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-medium text-amber-900">
            {pendientes.length} sin enviar · reintentando
          </span>
        )}
      </div>

      {sesionVencida && (
        <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-red-800">
          Su sesión venció. Los ingresos quedan guardados en este dispositivo.{" "}
          <a href={`/login?desde=/eventos/${eventoId}/checkin`} target="_blank" className="font-semibold underline">
            Ingrese de nuevo
          </a>{" "}
          y se enviarán solos.
        </p>
      )}

      {avisos.map((a, i) => (
        <div key={i} className="flex items-start justify-between gap-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900">
          <p>{a}</p>
          <button onClick={() => setAvisos((lista) => lista.filter((_, j) => j !== i))} className="text-sm underline">
            Cerrar
          </button>
        </div>
      ))}

      {vista.tipo === "busqueda" && (
        <>
          <input
            ref={buscador}
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && resultados.length === 1 && textoBuscado) {
                setVista({ tipo: "tarjeta", invitado: resultados[0], confirmandoCorreccion: false });
              }
            }}
            placeholder="Nombre, apellido o empresa"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="search"
            className="w-full rounded-xl border-2 border-slate-300 px-4 py-4 text-xl focus:border-slate-900 focus:outline-none"
          />

          {textoBuscado && (
            <ul className="divide-y overflow-hidden rounded-xl border bg-white">
              {resultados.length === 0 && (
                <li className="p-4 text-slate-600">{buscando ? "Buscando…" : "Nadie coincide con la búsqueda."}</li>
              )}
              {resultados.map((i) => (
                <li key={i.id}>
                  <button
                    onClick={() => setVista({ tipo: "tarjeta", invitado: i, confirmandoCorreccion: false })}
                    className="flex min-h-16 w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50"
                  >
                    <span>
                      <span className="block text-lg font-semibold">{i.nombreApellido}</span>
                      <span className="block text-slate-600">{i.empresa}</span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      {i.premiado && <span className="rounded bg-red-600 px-2 py-0.5 text-xs font-bold text-white">PREMIADO</span>}
                      {i.checkinEn && (
                        <span className="rounded bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                          Ingresó {formatearHora(i.checkinEn)}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {vista.tipo === "tarjeta" && (
        <Tarjeta
          invitado={vista.invitado}
          enviando={enviando}
          confirmandoCorreccion={vista.confirmandoCorreccion}
          onRegistrar={() => registrar(vista.invitado, false)}
          onPedirCorreccion={(si) => setVista({ ...vista, confirmandoCorreccion: si })}
          onCorregir={() => registrar(vista.invitado, true)}
          onVolver={volver}
        />
      )}

      {vista.tipo === "exito" && <Exito {...vista} onSiguiente={volver} />}
    </div>
  );
}

function Tarjeta({
  invitado: i,
  enviando,
  confirmandoCorreccion,
  onRegistrar,
  onPedirCorreccion,
  onCorregir,
  onVolver,
}: {
  invitado: Invitado;
  enviando: boolean;
  confirmandoCorreccion: boolean;
  onRegistrar: () => void;
  onPedirCorreccion: (si: boolean) => void;
  onCorregir: () => void;
  onVolver: () => void;
}) {
  const dato = (titulo: string, valor: string | null) =>
    valor && (
      <div>
        <dt className="text-sm text-slate-500">{titulo}</dt>
        <dd className="text-lg font-medium">{valor}</dd>
      </div>
    );

  return (
    <div className={`space-y-4 rounded-xl border-2 bg-white p-5 ${i.premiado ? "border-red-600" : "border-slate-200"}`}>
      {i.premiado && (
        <p className="rounded-lg bg-red-600 py-2 text-center text-xl font-black tracking-wide text-white">★ PREMIADO ★</p>
      )}
      <div>
        <h2 className="text-3xl font-bold">{i.nombreApellido}</h2>
        <p className="text-xl text-slate-700">{i.empresa}</p>
      </div>
      <dl className="grid grid-cols-2 gap-3">
        {dato("Cargo", i.cargo)}
        {dato("Sector", i.sector)}
        {dato("Rubro", i.rubro)}
      </dl>

      {i.confirmacion === "No Puede" && (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900">
          Avisó que no venía. Se puede registrar igual.
        </p>
      )}

      {i.checkinEn ? (
        <div className="space-y-3">
          <p role="alert" className="rounded-lg border-2 border-amber-400 bg-amber-50 p-4 text-xl font-semibold text-amber-900">
            Ya ingresó a las {formatearHora(i.checkinEn)}.
          </p>
          <button onClick={onVolver} className="w-full rounded-xl bg-slate-900 py-5 text-xl font-bold text-white">
            Volver a la búsqueda
          </button>
          {!confirmandoCorreccion ? (
            <button onClick={() => onPedirCorreccion(true)} className="w-full py-2 text-slate-600 underline">
              Corregir la hora de ingreso…
            </button>
          ) : (
            <div className="space-y-2 rounded-lg border border-slate-300 p-3">
              <p>
                ¿Reemplazar la hora {formatearHora(i.checkinEn)} por la hora actual? Queda registrado quién lo hizo.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={onCorregir}
                  disabled={enviando}
                  className="flex-1 rounded-lg bg-amber-600 py-3 font-semibold text-white disabled:opacity-40"
                >
                  Sí, reemplazar
                </button>
                <button onClick={() => onPedirCorreccion(false)} className="flex-1 rounded-lg border py-3 font-semibold">
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <button
            onClick={onRegistrar}
            disabled={enviando}
            className="w-full rounded-xl bg-green-600 py-6 text-2xl font-bold text-white active:bg-green-700 disabled:opacity-60"
          >
            {enviando ? "Registrando…" : "Registrar ingreso"}
          </button>
          <button onClick={onVolver} className="w-full py-2 text-slate-600 underline">
            Cancelar
          </button>
        </div>
      )}
    </div>
  );
}

function Exito({
  invitado: i,
  hora,
  pendiente,
  onSiguiente,
}: {
  invitado: Invitado;
  hora: string;
  pendiente: boolean;
  onSiguiente: () => void;
}) {
  const aviso = pendiente && (
    <p className="rounded-md bg-amber-100 p-3 text-base font-medium text-amber-900">
      Sin conexión: quedó guardado en este dispositivo y se envía solo cuando vuelva la red.
    </p>
  );

  if (i.premiado) {
    return (
      <div
        role="alert"
        className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-red-600 p-6 text-center text-white"
      >
        <p className="animate-pulse text-5xl font-black tracking-wider sm:text-7xl">★ PREMIADO ★</p>
        <p className="text-3xl font-bold sm:text-4xl">{i.nombreApellido}</p>
        <p className="text-xl">{i.empresa}</p>
        <p className="text-xl">
          {[i.rubro, i.sector && `Sector ${i.sector}`, `Ingresó ${hora}`].filter(Boolean).join(" · ")}
        </p>
        <p className="text-2xl font-semibold">Avise a la organización: sube al escenario.</p>
        {aviso}
        <button onClick={onSiguiente} autoFocus className="mt-4 rounded-xl bg-white px-8 py-5 text-xl font-bold text-red-700">
          Entendido · siguiente invitado
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={onSiguiente}
      className="flex w-full flex-col items-center gap-2 rounded-xl bg-green-600 p-8 text-center text-white"
    >
      <span className="text-5xl">✓</span>
      <span className="text-2xl font-bold">Ingreso registrado</span>
      <span className="text-xl">{i.nombreApellido}</span>
      <span className="text-lg">{[i.sector && `Sector ${i.sector}`, hora].filter(Boolean).join(" · ")}</span>
      {aviso}
      <span className="mt-2 text-sm opacity-80">Tocar para seguir</span>
    </button>
  );
}
