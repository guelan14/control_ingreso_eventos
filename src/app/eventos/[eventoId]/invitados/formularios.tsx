"use client";

import { useActionState, type ReactNode } from "react";
import { CONFIRMACION_VALORES } from "@/lib/invitados/constants";
import { crearInvitadoAccion, editarInvitadoAccion, type EstadoFormulario } from "./acciones";

type Rubro = { id: number; nombre: string };
type ConfigEvento = { eventoId: number; usaRubros: boolean; usaPremiados: boolean; rubros: Rubro[] };

/** Valores iniciales; después de enviar, los que mandó el usuario (el formulario se vacía al terminar). */
type Valores = {
  nombreApellido?: string;
  empresa?: string;
  cargo?: string | null;
  dni?: string | null;
  sector?: string | null;
  confirmacion?: string;
  premiado?: boolean;
  rubroId?: number | null;
};

const control = "w-full rounded-md border bg-white px-3 py-2";

function Campo({ titulo, error, children, ayuda }: { titulo: string; error?: string; children: ReactNode; ayuda?: string }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium">{titulo}</span>
      {children}
      {ayuda && !error && <span className="block text-xs text-slate-500">{ayuda}</span>}
      {error && <span className="block text-sm text-red-700">{error}</span>}
    </label>
  );
}

function Resultado({ estado }: { estado: EstadoFormulario }) {
  if (estado.error) {
    return (
      <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
        {estado.error}
      </p>
    );
  }
  if (estado.mensaje) {
    return (
      <p role="status" className="rounded-md border border-green-300 bg-green-50 p-3 text-sm text-green-800">
        {estado.mensaje}
      </p>
    );
  }
  return null;
}

/** Une los valores iniciales con los enviados en el último intento. */
function valoresActuales(iniciales: Valores, estado: EstadoFormulario): Valores {
  const e = estado.valores;
  if (!e) return iniciales;
  return {
    ...iniciales,
    ...e,
    premiado: e.premiado === "on",
    rubroId: e.rubroId ? Number(e.rubroId) : null,
  };
}

/** Campos comunes a la edición y al alta. */
function CamposEditables({ config, v, campos }: { config: ConfigEvento; v: Valores; campos?: Record<string, string> }) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo titulo="Confirmación *" error={campos?.confirmacion}>
          <select name="confirmacion" required defaultValue={v.confirmacion ?? CONFIRMACION_VALORES[0]} className={control}>
            {CONFIRMACION_VALORES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Campo>
        <Campo titulo="Sector" error={campos?.sector} ayuda="Ej. A, B, Sector C. Vacío = sin sector.">
          <input name="sector" maxLength={50} defaultValue={v.sector ?? ""} className={control} />
        </Campo>
        {config.usaRubros && (
          <Campo titulo="Rubro *" error={campos?.rubroId}>
            <select name="rubroId" required defaultValue={v.rubroId ?? ""} className={control}>
              <option value="" disabled>
                Elegir…
              </option>
              {config.rubros.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nombre}
                </option>
              ))}
            </select>
          </Campo>
        )}
        <Campo titulo="Cargo" error={campos?.cargo}>
          <input name="cargo" maxLength={150} defaultValue={v.cargo ?? ""} className={control} />
        </Campo>
      </div>
      {config.usaPremiados && (
        <label className="flex items-center gap-2">
          <input type="checkbox" name="premiado" defaultChecked={v.premiado ?? false} className="h-5 w-5" />
          <span className="font-medium">Premiado</span>
          <span className="text-sm text-slate-600">(alerta en el check-in y en el panel)</span>
        </label>
      )}
    </>
  );
}

export function FormularioAlta({ config }: { config: ConfigEvento }) {
  const [estado, accion, enviando] = useActionState(crearInvitadoAccion, {});
  const v = valoresActuales({}, estado);

  return (
    <form action={accion} className="space-y-4 rounded-lg border bg-white p-5">
      <input type="hidden" name="eventoId" value={config.eventoId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo titulo="Nombre y apellido *" error={estado.campos?.nombreApellido}>
          <input name="nombreApellido" required minLength={3} maxLength={150} defaultValue={v.nombreApellido} className={control} />
        </Campo>
        <Campo titulo="Empresa *" error={estado.campos?.empresa} ayuda="Puede incluir la sede.">
          <input name="empresa" required minLength={2} maxLength={150} defaultValue={v.empresa} className={control} />
        </Campo>
        <Campo titulo="DNI" error={estado.campos?.dni} ayuda="Opcional. Distingue homónimos.">
          <input name="dni" maxLength={30} inputMode="numeric" defaultValue={v.dni ?? ""} className={control} />
        </Campo>
      </div>
      <CamposEditables config={config} v={v} campos={estado.campos} />
      <Resultado estado={estado} />
      <button disabled={enviando} className="rounded-md bg-slate-900 px-4 py-2 font-medium text-white disabled:opacity-40">
        {enviando ? "Guardando…" : "Dar de alta"}
      </button>
    </form>
  );
}

export function FormularioEdicion({ config, invitadoId, iniciales }: { config: ConfigEvento; invitadoId: number; iniciales: Valores }) {
  const [estado, accion, enviando] = useActionState(editarInvitadoAccion, {});
  const v = valoresActuales(iniciales, estado);

  return (
    <form action={accion} className="space-y-4 rounded-lg border bg-white p-5">
      <h2 className="font-semibold">Editar</h2>
      <input type="hidden" name="eventoId" value={config.eventoId} />
      <input type="hidden" name="invitadoId" value={invitadoId} />
      <CamposEditables config={config} v={v} campos={estado.campos} />
      <Resultado estado={estado} />
      <button disabled={enviando} className="rounded-md bg-slate-900 px-4 py-2 font-medium text-white disabled:opacity-40">
        {enviando ? "Guardando…" : "Guardar cambios"}
      </button>
    </form>
  );
}
