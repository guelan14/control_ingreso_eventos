/**
 * Crea un usuario desde la terminal. Sirve sobre todo para el primer administrador, que después
 * crea al resto desde la pantalla Usuarios. Imprime una contraseña temporal que se cambia al ingresar.
 *
 * Uso: npm run usuario:crear -- --usuario admin --nombre "Nombre Apellido" --rol admin
 *
 * Con PGlite (pglite://...) hay que frenar `npm run dev` antes: la carpeta no admite dos procesos a la vez.
 */
import { parseArgs } from "node:util";
import { crearDbDesdeUrl } from "../src/db/create-db";
import { ROLES } from "../src/lib/auth/roles";
import { crearUsuario, nuevoUsuarioSchema } from "../src/lib/auth/usuarios";

const { values } = parseArgs({
  options: {
    usuario: { type: "string" },
    nombre: { type: "string" },
    rol: { type: "string", default: "admin" },
  },
});

const datos = nuevoUsuarioSchema.safeParse(values);
if (!datos.success) {
  console.error("Datos inválidos:");
  for (const i of datos.error.issues) console.error(`  --${i.path.join(".")}: ${i.message}`);
  console.error(`\nUso: npm run usuario:crear -- --usuario admin --nombre "Nombre Apellido" --rol ${ROLES.join("|")}`);
  process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Falta DATABASE_URL (ver .env.example).");
  process.exit(1);
}

try {
  const db = await crearDbDesdeUrl(url);
  const { usuario, claveTemporal } = await crearUsuario(db, datos.data);
  console.log(`✓ Usuario "${usuario.usuario}" (${usuario.rol}) creado.`);
  console.log(`  Contraseña temporal: ${claveTemporal}`);
  console.log("  Se pide cambiarla en el primer ingreso. No se vuelve a mostrar.");
  process.exit(0);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
