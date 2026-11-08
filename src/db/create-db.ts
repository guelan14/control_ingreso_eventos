import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { Pool } from "pg";
import * as schema from "./schema";

/** Cualquier conexión Postgres del proyecto (servidor real o PGlite). */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
/** Una conexión o una transacción abierta: las funciones de acceso a datos aceptan ambas. */
export type Ejecutor = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

const MIGRATIONS_DIR = path.join(process.cwd(), "drizzle");
const PREFIJO_PGLITE = "pglite://";

/** Postgres real. Las migraciones se aplican aparte con `npm run db:migrate`. */
export function crearDbPostgres(url: string): Db {
  const pool = new Pool({ connectionString: url, max: 10 });
  return drizzlePg(pool, { schema });
}

function procesoVivo(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

/**
 * PGlite no impide que dos procesos abran la misma carpeta, y si pasa, uno pisa los datos del otro
 * (por ejemplo `npm run usuario:crear` con `npm run dev` andando). Este archivo de bloqueo lo evita.
 */
function bloquearCarpeta(carpeta: string) {
  const archivo = `${path.resolve(carpeta)}.lock`;
  try {
    const pid = Number(fs.readFileSync(archivo, "utf8"));
    if (pid && pid !== process.pid && procesoVivo(pid)) {
      throw new Error(
        `La base PGlite "${carpeta}" ya está abierta por otro proceso (PID ${pid}), probablemente ` +
          "`npm run dev`. Frénelo (Ctrl+C) y vuelva a intentar.",
      );
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  fs.mkdirSync(path.dirname(archivo), { recursive: true });
  fs.writeFileSync(archivo, String(process.pid));
  // Si el proceso termina de golpe el archivo queda, pero su PID ya no existe y se ignora.
  process.once("exit", () => {
    try {
      if (fs.readFileSync(archivo, "utf8") === String(process.pid)) fs.rmSync(archivo);
    } catch {}
  });
}

/**
 * Postgres embebido (PGlite), sin instalar nada: para tests (en memoria) y desarrollo sin Docker.
 * Aplica las migraciones al abrir.
 */
export async function crearDbPglite(carpeta?: string): Promise<Db> {
  if (carpeta) bloquearCarpeta(carpeta);
  const db = drizzlePglite(new PGlite(carpeta), { schema });
  await migratePglite(db, { migrationsFolder: MIGRATIONS_DIR });
  return db;
}

/** DATABASE_URL=postgres://... (producción, Docker) o pglite://./data/pglite (desarrollo). */
export function crearDbDesdeUrl(url: string): Promise<Db> | Db {
  return url.startsWith(PREFIJO_PGLITE)
    ? crearDbPglite(url.slice(PREFIJO_PGLITE.length))
    : crearDbPostgres(url);
}
