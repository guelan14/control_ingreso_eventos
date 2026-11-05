"use client";

import { useActionState } from "react";
import { NOMBRE_ROL, ROLES, type Rol } from "@/lib/auth/roles";
import { crearUsuarioAccion, modificarUsuarioAccion, type EstadoUsuario } from "./acciones";

function Resultado({ estado }: { estado: EstadoUsuario }) {
  if (estado.error) {
    return (
      <p role="alert" className="text-sm text-red-700">
        {estado.error}
      </p>
    );
  }
  if (!estado.mensaje) return null;
  return (
    <div className="text-sm text-green-800">
      <p>{estado.mensaje}</p>
      {estado.claveTemporal && (
        <p className="mt-1 rounded-md border border-amber-300 bg-amber-50 p-2 text-amber-900">
          Contraseña temporal: <code className="font-mono text-base font-bold">{estado.claveTemporal}</code>
          <br />
          Désela a la persona por un medio seguro. No se vuelve a mostrar; la cambia al ingresar.
        </p>
      )}
    </div>
  );
}

const opcionesRol = ROLES.map((r) => (
  <option key={r} value={r}>
    {NOMBRE_ROL[r]}
  </option>
));

export function FormularioNuevoUsuario() {
  const [estado, accion, enviando] = useActionState(crearUsuarioAccion, {});
  const campo = "rounded-md border px-3 py-2 text-sm";

  return (
    <form action={accion} className="space-y-3 rounded-lg border bg-white p-5">
      <h2 className="font-semibold">Nuevo usuario</h2>
      <div className="flex flex-wrap gap-2">
        <input name="usuario" required placeholder="usuario (ej. jperez)" autoCapitalize="none" className={campo} />
        <input name="nombre" required placeholder="Nombre y apellido" className={campo} />
        <select name="rol" defaultValue="recepcion" className={campo}>
          {opcionesRol}
        </select>
        <button
          disabled={enviando}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          Crear
        </button>
      </div>
      <Resultado estado={estado} />
    </form>
  );
}

export function AccionesUsuario({ id, rol, activo, esUnoMismo }: { id: number; rol: Rol; activo: boolean; esUnoMismo: boolean }) {
  const [estado, accion, enviando] = useActionState(modificarUsuarioAccion, {});
  const boton = "rounded-md border px-2 py-1 text-xs hover:bg-slate-100 disabled:opacity-40";

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        {!esUnoMismo && (
          <>
            <form action={accion} className="flex gap-1">
              <input type="hidden" name="operacion" value="rol" />
              <input type="hidden" name="id" value={id} />
              <select name="rol" defaultValue={rol} className="rounded-md border px-1 py-1 text-xs">
                {opcionesRol}
              </select>
              <button disabled={enviando} className={boton}>
                Guardar rol
              </button>
            </form>
            <form action={accion}>
              <input type="hidden" name="operacion" value={activo ? "desactivar" : "activar"} />
              <input type="hidden" name="id" value={id} />
              <button disabled={enviando} className={boton}>
                {activo ? "Desactivar" : "Activar"}
              </button>
            </form>
          </>
        )}
        <form action={accion}>
          <input type="hidden" name="operacion" value="clave" />
          <input type="hidden" name="id" value={id} />
          <button disabled={enviando} className={boton}>
            Restablecer contraseña
          </button>
        </form>
      </div>
      <Resultado estado={estado} />
    </div>
  );
}
