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

/**
 * Postgres embebido (PGlite), sin instalar nada: para tests (en memoria) y desarrollo sin Docker.
 * Aplica las migraciones al abrir.
 */
export async function crearDbPglite(carpeta?: string): Promise<Db> {
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
