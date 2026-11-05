import { getDb } from "@/db/client";
import { requerirSesion } from "@/lib/auth/dal";
import { NOMBRE_ROL } from "@/lib/auth/roles";
import { listarUsuarios } from "@/lib/auth/usuarios";
import { formatearFechaHora } from "@/lib/fechas";
import { AccionesUsuario, FormularioNuevoUsuario } from "./componentes";

export default async function Usuarios() {
  const sesion = await requerirSesion("usuarios:gestionar");
  const usuarios = await listarUsuarios(await getDb());
  const ahora = new Date();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Usuarios</h1>
      <FormularioNuevoUsuario />

      <div className="overflow-x-auto rounded-lg border bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-100 text-slate-600">
            <tr>
              {["Nombre", "Usuario", "Rol", "Estado", "Último ingreso", ""].map((h) => (
                <th key={h} className="px-3 py-2 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {usuarios.map((u) => (
              <tr key={u.id} className="border-t align-top">
                <td className="px-3 py-2 font-medium">{u.nombre}</td>
                <td className="px-3 py-2 font-mono">{u.usuario}</td>
                <td className="px-3 py-2">{NOMBRE_ROL[u.rol]}</td>
                <td className="px-3 py-2">
                  {!u.activo
                    ? "Desactivado"
                    : u.bloqueadoHasta && u.bloqueadoHasta > ahora
                      ? "Bloqueado por intentos"
                      : u.debeCambiarClave
                        ? "Contraseña temporal"
                        : "Activo"}
                </td>
                <td className="px-3 py-2">{u.ultimoIngreso ? formatearFechaHora(u.ultimoIngreso) : "Nunca"}</td>
                <td className="px-3 py-2">
                  <AccionesUsuario id={u.id} rol={u.rol} activo={u.activo} esUnoMismo={u.id === sesion.usuarioId} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
