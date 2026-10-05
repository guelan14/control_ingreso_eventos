import "server-only";
import { createDb, type Db } from "./create-db";

// En desarrollo el hot-reload reevalúa los módulos; guardamos la conexión en globalThis
// para no abrir un archivo SQLite nuevo en cada cambio.
const globalForDb = globalThis as unknown as { db?: Db };

export function getDb(): Db {
  globalForDb.db ??= createDb(process.env.DATABASE_PATH ?? "./data/eventos.db");
  return globalForDb.db;
}
